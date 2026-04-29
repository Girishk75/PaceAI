/*
 * PaceAI Foot Pod — Firmware v2.3
 * Hardware : ESP32 DevKit + MPU6050  (ankle mount, under sock)
 * Output   : BLE GATT notify — "cadence,impact,gct,steps,strike,pronation" every 1 s
 *
 * v2.3 additions
 * ──────────────
 * FOOT STRIKE  Complementary filter tracks pitch (sagittal plane).  At Initial
 *              Contact the pitch delta vs. calibrated neutral classifies
 *              heel / midfoot / forefoot strike.
 * PRONATION    Peak signed roll deviation during GCT_STANCE classifies
 *              neutral / excessive (overpronation) / rigid (supination).
 * CALIBRATION  10-second still period now also records neutral pitch + roll so
 *              that per-step deltas are sensor-orientation-independent.
 *
 * Root fixes vs v1.1
 * ──────────────────
 * CALIBRATION BUG  Standard libraries (MPU6050_light calcOffsets with accel=true)
 *                  zero each accel axis individually and force Z→1G, which only
 *                  works when the sensor is mounted flat (Z-up). At the ankle the
 *                  sensor can be in any orientation, so the library was zeroing out
 *                  real gravity components and producing a broken noise floor.
 *                  Fix: gyro-only offset calibration + magnitude-based detection.
 *                  sqrt(ax²+ay²+az²) == 1G at rest regardless of sensor orientation.
 *
 * GCT = 410 ms     Safety timeout fired on every footstrike because threshold-based
 *                  exit never triggered reliably at ankle.
 *                  Fix: two-stage gyroscope GCT — wait for gyro to settle (stance),
 *                  then detect toe-off from gyro rise (terminal contact).
 *
 * ±2G CLIPPING     Running peaks measured at 3.08G — beyond the 2G range.
 *                  Fix: ±8G range (4096 LSB/G).
 *
 * PHANTOM STEPS    1.2G threshold was too close to the ankle noise floor.
 *                  Fix: dynamic threshold derived from 10-second still baseline.
 *
 * BLE UUIDs, data format, and broadcast rate are UNCHANGED — app is compatible.
 */

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <math.h>

// ── BLE — DO NOT CHANGE (must match app) ───────────────────────────────────
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define DEVICE_NAME         "PaceAI-FootPod"

// ── MPU6050 register map ────────────────────────────────────────────────────
#define MPU_ADDR      0x68
#define R_PWR_MGMT_1  0x6B   // power / clock source
#define R_CONFIG      0x1A   // DLPF config
#define R_GYRO_CFG    0x1B   // gyro full-scale select
#define R_ACCEL_CFG   0x1C   // accel full-scale select
#define R_ACCEL_OUT   0x3B   // first of 6 accel bytes (big-endian XYZ)
#define R_GYRO_OUT    0x43   // first of 6 gyro  bytes (big-endian XYZ)

// Scale factors for chosen ranges
//   ±8G      → AFS_SEL=2 → 4096 LSB/G
//   ±2000°/s → FS_SEL=3  → 16.4 LSB/(°/s)
#define ACCEL_SENS    4096.0f
#define GYRO_SENS     16.4f

// ── Timing ─────────────────────────────────────────────────────────────────
#define SAMPLE_MS     10      // 100 Hz main loop
#define CAL_SAMPLES   1000    // 10 s still calibration at 100 Hz
#define BLE_MS        1000    // BLE broadcast period

// ── Step / impact detection ─────────────────────────────────────────────────
#define MIN_STEP_MS   220     // refractory period — prevents double-counting
                              // (~272 spm max, well above human limits)
#define IMPACT_EXIT_R 0.75f   // exit threshold = peak × this ratio (hysteresis)
#define MIN_IMPACT_G  2.0f    // hard floor for dynamic threshold
                              // (benchmark still floor = 1.48G, running = 2.61G)

// ── GCT (gyroscope-based) ───────────────────────────────────────────────────
#define GYRO_SETTLE   50.0f   // °/s — below this confirms foot is on ground
#define GYRO_LIFTOFF  120.0f  // °/s — above this signals toe-off
#define MIN_GCT_MS    80      // shortest plausible contact time
#define MAX_GCT_MS    600     // hard cap (replaces the 400ms timeout in v1.1)

// ── Cadence ─────────────────────────────────────────────────────────────────
#define CAD_BUF       6       // rolling window: last 6 same-foot intervals

// ── Complementary filter ─────────────────────────────────────────────────────
#define CF_ALPHA      0.98f   // gyro weight; (1-alpha) = accel weight
#define CF_DT         0.01f   // sample period in seconds (= SAMPLE_MS / 1000)

// ── Strike / pronation classification thresholds (degrees from neutral) ──────
#define STRIKE_HEEL_DEG    8.0f   // pitch delta > +8° at IC → heel strike
#define STRIKE_FORE_DEG   -5.0f   // pitch delta < -5° at IC → forefoot
                                   // else → midfoot
#define PRON_OVER_DEG      8.0f   // peak roll delta > +8° during stance → overpronation
#define PRON_RIGID_DEG    -6.0f   // peak roll delta < -6° during stance → rigid/supination
                                   // else → neutral

// ── Strike / pronation output codes ──────────────────────────────────────────
#define STRIKE_MIDFOOT  0
#define STRIKE_HEEL     1
#define STRIKE_FORE     2
#define PRON_NEUTRAL    0
#define PRON_OVER       1
#define PRON_RIGID      2

// ── Hardware ─────────────────────────────────────────────────────────────────
#define LED_PIN       2       // built-in blue LED on most ESP32 DevKit boards

// ── IMU reading ─────────────────────────────────────────────────────────────
struct Imu {
  float ax, ay, az;    // acceleration in G
  float gx, gy, gz;    // angular rate in °/s  (gyro offsets already removed)
  float aMag;          // |a| in G
  float gMag;          // |ω| in °/s
  float accelPitch;    // degrees — pitch from accelerometer (sagittal plane)
  float accelRoll;     // degrees — roll  from accelerometer (frontal plane)
};

// ── Calibration results ─────────────────────────────────────────────────────
static float gyroOff[3];       // raw-unit gyro axis offsets (subtracted before scaling)
static float impactThresh;     // G — auto-set from still baseline
static float exitThresh;       // G — impactThresh × IMPACT_EXIT_R
static float neutralPitch;     // degrees — calibrated pitch at rest
static float neutralRoll;      // degrees — calibrated roll  at rest

// ── Complementary filter state ───────────────────────────────────────────────
static float cfPitch = 0;   // degrees — sagittal (heel-toe) tilt
static float cfRoll  = 0;   // degrees — frontal  (inward-outward) tilt

// ── Strike / pronation output ─────────────────────────────────────────────────
static int8_t  lastStrike      = -1;  // -1 = not yet classified
static int8_t  lastPronation   = -1;  // -1 = not yet classified
static float   peakRollDelta   =  0;  // signed peak roll deviation during stance

// ── Strike state ────────────────────────────────────────────────────────────
static bool     inStrike    = false;
static float    peakG       = 0;
static uint32_t lastStepMs  = 0;
static uint32_t totalSteps  = 0;
static float    lastImpact  = 0;

// ── GCT state machine ───────────────────────────────────────────────────────
enum GCTPhase { GCT_IDLE, GCT_SETTLING, GCT_STANCE };
static GCTPhase gctPhase  = GCT_IDLE;
static uint32_t gctStart  = 0;
static float    lastGCT   = 0;

// ── Cadence ─────────────────────────────────────────────────────────────────
static uint32_t cadBuf[CAD_BUF] = {0};
static uint8_t  cadIdx   = 0;
static uint8_t  cadCount = 0;
static float    lastCad  = 0;

// ── BLE ─────────────────────────────────────────────────────────────────────
static BLECharacteristic *pChar;
static bool     bleConnected = false;
static uint32_t lastBleMs   = 0;

// ── Loop timing ─────────────────────────────────────────────────────────────
static uint32_t lastSampleMs = 0;
static uint32_t lastLedMs    = 0;
static bool     calDone      = false;


// ═══════════════════════════════════════════════════════════════════════════
//  MPU6050 helpers — direct I2C, no library
// ═══════════════════════════════════════════════════════════════════════════

static void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Configure sensor for v2.0 parameters
static void mpuConfigure() {
  mpuWrite(R_PWR_MGMT_1, 0x01);  // wake up + use X-gyro PLL clock (lower drift)
  delay(100);
  mpuWrite(R_CONFIG,    0x03);   // DLPF bandwidth 44 Hz — removes shoe vibration,
                                 // preserves footstrike transients (>10 Hz peaks)
  mpuWrite(R_GYRO_CFG,  0x18);   // ±2000 °/s (FS_SEL = 3)
  mpuWrite(R_ACCEL_CFG, 0x10);   // ±8G     (AFS_SEL = 2)
}

// Read 14 bytes (accel XYZ + temp + gyro XYZ) in one I2C burst.
// Returns false if the bus returns fewer bytes than expected.
static bool mpuReadRaw(int16_t &ax, int16_t &ay, int16_t &az,
                       int16_t &gx, int16_t &gy, int16_t &gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(R_ACCEL_OUT);
  Wire.endTransmission(false);
  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14) < 14) return false;

  ax = (int16_t)(Wire.read() << 8 | Wire.read());
  ay = (int16_t)(Wire.read() << 8 | Wire.read());
  az = (int16_t)(Wire.read() << 8 | Wire.read());
  Wire.read(); Wire.read();  // temperature register — discard
  gx = (int16_t)(Wire.read() << 8 | Wire.read());
  gy = (int16_t)(Wire.read() << 8 | Wire.read());
  gz = (int16_t)(Wire.read() << 8 | Wire.read());
  return true;
}

// Scale raw values + remove gyro offsets → physical units
static Imu mpuToImu(int16_t ax, int16_t ay, int16_t az,
                    int16_t gx, int16_t gy, int16_t gz) {
  Imu s;
  s.ax = ax / ACCEL_SENS;
  s.ay = ay / ACCEL_SENS;
  s.az = az / ACCEL_SENS;
  s.aMag = sqrtf(s.ax*s.ax + s.ay*s.ay + s.az*s.az);

  // Subtract raw-unit offsets before scaling — preserves precision
  s.gx = (gx - gyroOff[0]) / GYRO_SENS;
  s.gy = (gy - gyroOff[1]) / GYRO_SENS;
  s.gz = (gz - gyroOff[2]) / GYRO_SENS;
  s.gMag = sqrtf(s.gx*s.gx + s.gy*s.gy + s.gz*s.gz);

  // Accel-based angles — drift-free long-term reference for the CF.
  // atan2(ax, az) = sagittal pitch; atan2(ay, az) = frontal roll.
  // Clamp az to avoid instability when near ±90°.
  float az_safe    = (fabsf(s.az) < 0.01f) ? 0.01f : s.az;
  s.accelPitch     = atan2f(s.ax, az_safe) * (180.0f / M_PI);
  s.accelRoll      = atan2f(s.ay, az_safe) * (180.0f / M_PI);
  return s;
}


// ═══════════════════════════════════════════════════════════════════════════
//  Calibration
//  Runs once at power-on while pod is still.
//
//  Gyro : average 1000 raw samples per axis → zero offsets.
//         Works regardless of mounting orientation.
//
//  Accel: do NOT try to calibrate per-axis (that assumes Z-up mounting).
//         Instead measure the scalar magnitude at rest.  |a| == 1G always
//         when stationary, regardless of angle.  Use the measured baseline
//         and its standard deviation to set a robust dynamic threshold.
// ═══════════════════════════════════════════════════════════════════════════

static void calibrate() {
  Serial.println("PaceAI v2.3 — hold pod still for ~12 seconds...");

  double sumGx = 0, sumGy = 0, sumGz = 0;
  double sumMag = 0, sumMagSq = 0;
  int    good   = 0;

  for (int i = 0; i < CAL_SAMPLES; i++) {
    int16_t ax, ay, az, gx, gy, gz;
    if (!mpuReadRaw(ax, ay, az, gx, gy, gz)) {
      delay(SAMPLE_MS);
      continue;  // skip bad read, loop still ends after CAL_SAMPLES iterations
    }
    sumGx += gx;
    sumGy += gy;
    sumGz += gz;

    float fax = ax / ACCEL_SENS;
    float fay = ay / ACCEL_SENS;
    float faz = az / ACCEL_SENS;
    float mag = sqrtf(fax*fax + fay*fay + faz*faz);
    sumMag   += mag;
    sumMagSq += (double)mag * mag;
    good++;

    if (i % 100 == 0) {
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      Serial.printf("  %d%%\r", i / 10);
    }
    delay(SAMPLE_MS);
  }

  if (good < 100) {
    Serial.println("ERROR: fewer than 100 good samples — check I2C wiring");
    while (true) {
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
      delay(200);
    }
  }

  // Gyro DC offsets (raw int16 units — subtracted before scaling in mpuToImu)
  gyroOff[0] = (float)(sumGx / good);
  gyroOff[1] = (float)(sumGy / good);
  gyroOff[2] = (float)(sumGz / good);

  // Gravity baseline and noise stats from accel magnitude
  float baseline = (float)(sumMag / good);
  float variance = (float)(sumMagSq / good) - baseline * baseline;
  float stddev   = sqrtf(fabsf(variance));

  // threshold = baseline + max(4σ, 40% of baseline)
  //   4σ  : clears sensor noise band with high confidence
  //   40% : ensures minimum separation even if σ is unusually small
  //   MIN_IMPACT_G floor: never go below the empirical running-vs-still gap
  float margin = fmaxf(4.0f * stddev, 0.4f * baseline);
  impactThresh = fmaxf(baseline + margin, MIN_IMPACT_G);
  exitThresh   = impactThresh * IMPACT_EXIT_R;

  // Neutral pitch + roll — 200 samples at rest after gyroOff is established.
  // Initialises the complementary filter to the actual mounting angle so that
  // per-step deltas are sensor-orientation-independent.
  double sumPitch = 0, sumRoll = 0;
  int    goodAng  = 0;
  for (int i = 0; i < 200; i++) {
    int16_t ax2, ay2, az2, gx2, gy2, gz2;
    if (!mpuReadRaw(ax2, ay2, az2, gx2, gy2, gz2)) { delay(SAMPLE_MS); continue; }
    Imu tmp = mpuToImu(ax2, ay2, az2, gx2, gy2, gz2);
    sumPitch += tmp.accelPitch;
    sumRoll  += tmp.accelRoll;
    goodAng++;
    delay(SAMPLE_MS);
  }
  neutralPitch = (goodAng > 0) ? (float)(sumPitch / goodAng) : 0.0f;
  neutralRoll  = (goodAng > 0) ? (float)(sumRoll  / goodAng) : 0.0f;
  cfPitch = neutralPitch;   // seed CF at actual resting angle
  cfRoll  = neutralRoll;

  calDone = true;
  digitalWrite(LED_PIN, HIGH);  // solid = ready

  Serial.printf("\nCalibration complete\n");
  Serial.printf("  Baseline : %.3f G  (σ = %.4f G)\n", baseline, stddev);
  Serial.printf("  Threshold: %.3f G  (exit: %.3f G)\n", impactThresh, exitThresh);
  Serial.printf("  Gyro off : %.0f / %.0f / %.0f  (raw units)\n",
                gyroOff[0], gyroOff[1], gyroOff[2]);
  Serial.printf("  Neutral  : pitch %.1f°  roll %.1f°\n", neutralPitch, neutralRoll);
}


// ═══════════════════════════════════════════════════════════════════════════
//  processSample — called at 100 Hz
//
//  Strike detection  : magnitude threshold with hysteresis
//  GCT               : two-stage gyro state machine
//                        GCT_SETTLING → wait for gyro to drop  (foot landing)
//                        GCT_STANCE   → wait for gyro to rise  (toe-off)
//  Cadence           : rolling mean of last CAD_BUF same-foot intervals
// ═══════════════════════════════════════════════════════════════════════════

static void processSample(const Imu &s) {
  uint32_t now = millis();

  // — Complementary filter — runs every sample (100 Hz) ——————————————————
  // Fuses gyro integration (precise short-term) with accel angles (drift-free
  // long-term reference).  cfPitch/cfRoll track real ankle orientation.
  cfPitch = CF_ALPHA * (cfPitch + s.gx * CF_DT) + (1.0f - CF_ALPHA) * s.accelPitch;
  cfRoll  = CF_ALPHA * (cfRoll  + s.gy * CF_DT) + (1.0f - CF_ALPHA) * s.accelRoll;

  // — Strike / step detection ————————————————————————————————————————————
  if (!inStrike) {
    if (s.aMag >= impactThresh && (now - lastStepMs) >= (uint32_t)MIN_STEP_MS) {
      inStrike = true;
      peakG    = s.aMag;

      // Initial Contact — classify foot strike from pitch delta vs neutral
      float pitchDelta = cfPitch - neutralPitch;
      if      (pitchDelta >  STRIKE_HEEL_DEG) lastStrike = STRIKE_HEEL;
      else if (pitchDelta <  STRIKE_FORE_DEG) lastStrike = STRIKE_FORE;
      else                                    lastStrike = STRIKE_MIDFOOT;
      peakRollDelta = 0;  // reset pronation accumulator for this step

      // Start GCT timer
      gctPhase = GCT_SETTLING;
      gctStart = now;
    }
  } else {
    // Track peak while above exit threshold
    if (s.aMag > peakG) peakG = s.aMag;

    if (s.aMag < exitThresh) {
      // Strike ended: register step
      inStrike   = false;
      lastImpact = peakG;
      totalSteps++;

      // Cadence from same-foot step intervals
      if (lastStepMs > 0) {
        uint32_t interval = now - lastStepMs;
        cadBuf[cadIdx] = interval;
        cadIdx = (cadIdx + 1) % CAD_BUF;
        if (cadCount < CAD_BUF) cadCount++;

        float sum = 0;
        for (uint8_t i = 0; i < cadCount; i++) {
          // Walk backwards through circular buffer
          uint8_t idx = (cadIdx + CAD_BUF - 1 - i) % CAD_BUF;
          sum += (float)cadBuf[idx];
        }
        lastCad = 60000.0f / (sum / cadCount);
      }
      lastStepMs = now;
    }
  }

  // — GCT state machine ——————————————————————————————————————————————————
  switch (gctPhase) {
    case GCT_IDLE:
      break;

    case GCT_SETTLING:
      // Foot is still rotating/vibrating after impact — wait for it to settle
      if (s.gMag < GYRO_SETTLE) {
        gctPhase = GCT_STANCE;       // foot confirmed on ground
      } else if (now - gctStart > (uint32_t)MAX_GCT_MS) {
        gctPhase = GCT_IDLE;         // timed out — discard this GCT
      }
      break;

    case GCT_STANCE:
      // Foot on ground — track peak roll deviation for pronation, wait for toe-off
      {
        float rollDelta = cfRoll - neutralRoll;
        if (fabsf(rollDelta) > fabsf(peakRollDelta)) peakRollDelta = rollDelta;
      }
      if (s.gMag > GYRO_LIFTOFF) {
        uint32_t dur = now - gctStart;
        if (dur >= (uint32_t)MIN_GCT_MS) {
          lastGCT = (float)fminf((float)dur, (float)MAX_GCT_MS);
        }
        // Classify pronation from signed peak roll deviation during stance
        if      (peakRollDelta >  PRON_OVER_DEG)  lastPronation = PRON_OVER;
        else if (peakRollDelta <  PRON_RIGID_DEG) lastPronation = PRON_RIGID;
        else                                       lastPronation = PRON_NEUTRAL;
        gctPhase = GCT_IDLE;
      } else if (now - gctStart > (uint32_t)MAX_GCT_MS) {
        // Foot contact too long — cap and classify with whatever roll we saw
        lastGCT = (float)MAX_GCT_MS;
        if      (peakRollDelta >  PRON_OVER_DEG)  lastPronation = PRON_OVER;
        else if (peakRollDelta <  PRON_RIGID_DEG) lastPronation = PRON_RIGID;
        else                                       lastPronation = PRON_NEUTRAL;
        gctPhase = GCT_IDLE;
      }
      break;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  BLE
// ═══════════════════════════════════════════════════════════════════════════

class BLECBs : public BLEServerCallbacks {
  void onConnect(BLEServer *)    override { bleConnected = true; }
  void onDisconnect(BLEServer *) override {
    bleConnected = false;
    BLEDevice::startAdvertising();  // auto-restart advertising
  }
};

static void bleSetup() {
  BLEDevice::init(DEVICE_NAME);
  BLEServer  *srv = BLEDevice::createServer();
  srv->setCallbacks(new BLECBs());

  BLEService *svc = srv->createService(SERVICE_UUID);
  pChar = svc->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );
  pChar->addDescriptor(new BLE2902());
  svc->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);   // helps iPhone discover faster
  BLEDevice::startAdvertising();
}

// Broadcast "cadence,impact,gct,steps,strike,pronation"
// cadence  = total spm (both feet) — app uses directly, no doubling
// strike   : 0=midfoot  1=heel  2=forefoot  -1=not yet classified
// pronation: 0=neutral  1=over  2=rigid     -1=not yet classified
static void bleBroadcast() {
  char buf[80];
  snprintf(buf, sizeof(buf), "%.0f,%.2f,%.0f,%lu,%d,%d",
           lastCad, lastImpact, lastGCT, (unsigned long)totalSteps,
           (int)lastStrike, (int)lastPronation);
  pChar->setValue((uint8_t *)buf, strlen(buf));
  pChar->notify();
}


// ═══════════════════════════════════════════════════════════════════════════
//  Arduino entrypoints
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Wire.begin();
  Wire.setClock(400000);  // 400 kHz fast mode
  delay(200);             // let MPU6050 power-on settle

  mpuConfigure();
  delay(100);
  calibrate();            // blocking — 10 seconds
  bleSetup();

  lastSampleMs = millis();
  lastBleMs    = millis();

  Serial.println("PaceAI FootPod v2.3 — advertising");
  Serial.printf("Impact threshold: %.3f G  |  GCT settle/liftoff: %.0f / %.0f deg/s\n",
                impactThresh, GYRO_SETTLE, GYRO_LIFTOFF);
}

void loop() {
  uint32_t now = millis();

  // 100 Hz sample
  if (now - lastSampleMs >= (uint32_t)SAMPLE_MS) {
    lastSampleMs = now;
    int16_t ax, ay, az, gx, gy, gz;
    if (mpuReadRaw(ax, ay, az, gx, gy, gz)) {
      Imu s = mpuToImu(ax, ay, az, gx, gy, gz);
      processSample(s);
    }
  }

  // 1 Hz BLE broadcast
  if (now - lastBleMs >= (uint32_t)BLE_MS) {
    lastBleMs = now;
    bleBroadcast();
    Serial.printf("[BLE] cad=%.0f  imp=%.2fG  gct=%.0fms  steps=%lu  str=%d  pro=%d  conn=%d\n",
                  lastCad, lastImpact, lastGCT, (unsigned long)totalSteps,
                  (int)lastStrike, (int)lastPronation, (int)bleConnected);
  }

  // LED: slow blink when idle, solid when BLE connected
  if (calDone && !bleConnected) {
    if (now - lastLedMs >= 1000) {
      lastLedMs = now;
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
  } else if (bleConnected) {
    digitalWrite(LED_PIN, HIGH);
  }
}
