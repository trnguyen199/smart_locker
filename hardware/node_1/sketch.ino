#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ============================================================================
// SMART LOCKER WOKWI FIRMWARE — NODE 1 (QUẢN LÝ NGĂN 01, 02, 03)
// Kết nối trực tiếp với Web App + Mô phỏng 3D qua EMQX MQTT (broker.emqx.io)
// ============================================================================
#define NODE_ID 1
#define RELAY_ACTIVE_HIGH true

const char* WIFI_SSID   = "Wokwi-GUEST";
const char* WIFI_PASS   = "";
const char* MQTT_BROKER = "broker.emqx.io";
const int   MQTT_PORT   = 1883;
const char* TOPIC_PREFIX = "uth/iot/smartlocker/nhom4_trnguyen199";

struct SlotConfig {
  int slot;
  bool isCool;
  int servoPin;
  int switchPin;
  int tempPin;
  int relayPin;
  float targetTemp;
};

SlotConfig SLOTS[3] = {
  { 1, true,  13, 32, 16, 26, 25.0 },
  { 2, false, 14, 33, 17, -1, 25.0 },
  { 3, true,  27, 25, 18, 19, 25.0 }
};

Servo servos[3];
OneWire* oneWires[3];
DallasTemperature* sensors[3];

bool doorOpen[3] = { false, false, false };
bool unlocked[3] = { false, false, false };
bool relayState[3] = { false, false, false };
String slotMode[3] = { "OFF", "OFF", "OFF" };
float currentTemp[3] = { 25.0, 25.0, 25.0 };
int lastRawSwitch[3] = { LOW, LOW, LOW };

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String topicCmd;
String topicState;
String topicHeartbeat;

unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastTempReqMs = 0;
unsigned long tempReadyAtMs = 0;
bool tempConversionPending = false;
float lastPublishedTemp[3] = { 25.0, 25.0, 25.0 };
int pendingRawSwitch[3] = { LOW, LOW, LOW };
unsigned long switchChangedAt[3] = { 0, 0, 0 };

void setRelay(int idx, bool on) {
  if (SLOTS[idx].relayPin < 0) return;
  relayState[idx] = on;
  digitalWrite(SLOTS[idx].relayPin, RELAY_ACTIVE_HIGH ? (on ? HIGH : LOW) : (on ? LOW : HIGH));
}

void setServo(int idx, bool openAngle) {
  unlocked[idx] = openAngle;
  servos[idx].write(openAngle ? 90 : 0);
}

void publishSlotState(int idx, const char* eventName) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> doc;
  doc["node_id"] = NODE_ID;
  doc["slot"] = SLOTS[idx].slot;
  doc["door_open"] = doorOpen[idx];
  doc["door_locked"] = !unlocked[idx];
  doc["current_temp"] = round(currentTemp[idx] * 10.0) / 10.0;
  doc["relay_on"] = relayState[idx];
  doc["event"] = eventName;

  char out[256];
  serializeJson(doc, out);
  mqtt.publish(topicState.c_str(), out);
}

void publishHeartbeat() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<128> doc;
  doc["node_id"] = NODE_ID;
  doc["online"] = true;
  doc["uptime_ms"] = millis();
  char out[128];
  serializeJson(doc, out);
  mqtt.publish(topicHeartbeat.c_str(), out);
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;

  int targetSlot = doc["slot"] | 0;
  const char* cmd = doc["cmd"] | "";

  for (int i = 0; i < 3; i++) {
    if (SLOTS[i].slot != targetSlot) continue;

    if (doc.containsKey("target_temp")) {
      SLOTS[i].targetTemp = doc["target_temp"].as<float>();
    }
    if (doc.containsKey("mode")) {
      slotMode[i] = String((const char*)doc["mode"]);
    }
    if (doc.containsKey("door_open")) {
      bool wantOpen = doc["door_open"].as<bool>();
      setServo(i, wantOpen);
    } else if (strcmp(cmd, "UNLOCK") == 0) {
      setServo(i, true);
    } else if (strcmp(cmd, "LOCK") == 0) {
      setServo(i, false);
    }

    if (doc.containsKey("relay_on") && SLOTS[i].relayPin >= 0) {
      setRelay(i, doc["relay_on"].as<bool>());
    } else if (SLOTS[i].relayPin >= 0) {
      bool shouldCool = (slotMode[i] == "COOL") && (currentTemp[i] > SLOTS[i].targetTemp - 0.3);
      setRelay(i, shouldCool);
    }

    Serial.printf("[NODE %d] Tu %02d <- CMD=%s | Servo=%d deg | Mode=%s %.1fC | Relay=%s\n",
      NODE_ID, SLOTS[i].slot, cmd, unlocked[i] ? 90 : 0,
      slotMode[i].c_str(), SLOTS[i].targetTemp, relayState[i] ? "ON" : "OFF");
  }
}

void ensureConnections() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.print("Dang ket noi WiFi Wokwi-GUEST");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    while (WiFi.status() != WL_CONNECTED) {
      delay(300);
      Serial.print(".");
    }
    Serial.println(" OK!");
  }
  while (!mqtt.connected()) {
    String clientId = "sl_wokwi_node" + String(NODE_ID) + "_" + String(random(1000, 9999));
    Serial.printf("Dang ket noi MQTT %s...\n", MQTT_BROKER);
    if (mqtt.connect(clientId.c_str())) {
      mqtt.subscribe(topicCmd.c_str(), 1);
      Serial.printf("Da ket noi MQTT! Subscribed: %s\n", topicCmd.c_str());
      publishHeartbeat();
      for (int i = 0; i < 3; i++) publishSlotState(i, "BOOT_SYNC");
    } else {
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  randomSeed(micros());

  topicCmd = String(TOPIC_PREFIX) + "/wokwi/node_" + String(NODE_ID) + "/cmd";
  topicState = String(TOPIC_PREFIX) + "/wokwi/node_" + String(NODE_ID) + "/state";
  topicHeartbeat = String(TOPIC_PREFIX) + "/wokwi/node_" + String(NODE_ID) + "/heartbeat";

  for (int i = 0; i < 3; i++) {
    servos[i].attach(SLOTS[i].servoPin, 500, 2400);
    setServo(i, false);
    pinMode(SLOTS[i].switchPin, INPUT_PULLUP);
    lastRawSwitch[i] = digitalRead(SLOTS[i].switchPin);
    pendingRawSwitch[i] = lastRawSwitch[i];
    doorOpen[i] = (lastRawSwitch[i] == HIGH);

    if (SLOTS[i].relayPin >= 0) {
      pinMode(SLOTS[i].relayPin, OUTPUT);
      setRelay(i, false);
    }

    oneWires[i] = new OneWire(SLOTS[i].tempPin);
    sensors[i] = new DallasTemperature(oneWires[i]);
    sensors[i]->begin();
    sensors[i]->setResolution(9);
    sensors[i]->setWaitForConversion(false);
    sensors[i]->requestTemperatures();
  }
  tempConversionPending = true;
  tempReadyAtMs = millis() + 150;
  lastTempReqMs = millis();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(10);
  mqtt.setSocketTimeout(2);
  ensureConnections();
}

void loop() {
  ensureConnections();
  mqtt.loop();

  unsigned long now = millis();

  // 1. Quét công tắc cửa non-blocking (phản hồi < 30ms)
  for (int i = 0; i < 3; i++) {
    int sw = digitalRead(SLOTS[i].switchPin);
    if (sw != pendingRawSwitch[i]) {
      pendingRawSwitch[i] = sw;
      switchChangedAt[i] = now;
    } else if (sw != lastRawSwitch[i] && (now - switchChangedAt[i] >= 20)) {
      lastRawSwitch[i] = sw;
      doorOpen[i] = (sw == HIGH);
      setServo(i, doorOpen[i]);
      Serial.printf("[NODE %d] Cong tac cua Tu %02d -> %s\n",
        NODE_ID, SLOTS[i].slot, doorOpen[i] ? "MO (HIGH)" : "DONG (LOW)");
      publishSlotState(i, doorOpen[i] ? "DOOR_OPENED" : "DOOR_CLOSED");
      mqtt.loop();
    }
  }

  // 2. Đọc cảm biến DS18B20 bất đồng bộ (không làm treo mqtt.loop)
  if (!tempConversionPending && (now - lastTempReqMs >= 700)) {
    lastTempReqMs = now;
    for (int i = 0; i < 3; i++) {
      sensors[i]->requestTemperatures();
    }
    tempConversionPending = true;
    tempReadyAtMs = now + 150;
  } else if (tempConversionPending && (long)(now - tempReadyAtMs) >= 0) {
    tempConversionPending = false;
    bool periodicDue = (now - lastTelemetryMs >= 4000);
    if (periodicDue) lastTelemetryMs = now;

    for (int i = 0; i < 3; i++) {
      float t = sensors[i]->getTempCByIndex(0);
      if (t > -55.0 && t < 125.0) {
        currentTemp[i] = t;
      }
      if (SLOTS[i].relayPin >= 0) {
        bool shouldCool = (slotMode[i] == "COOL") && (currentTemp[i] > SLOTS[i].targetTemp - 0.3);
        setRelay(i, shouldCool);
      }
      if (periodicDue || fabs(currentTemp[i] - lastPublishedTemp[i]) >= 0.2) {
        lastPublishedTemp[i] = currentTemp[i];
        publishSlotState(i, "TELEMETRY");
        mqtt.loop();
      }
    }
  }

  if (now - lastHeartbeatMs >= 5000) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }
}
