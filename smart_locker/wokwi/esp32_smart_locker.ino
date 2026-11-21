/*
 * SMART LOCKER ESP32 FIRMWARE (WOKWI SIMULATION)
 * Đồng bộ 100% JSON Contract với Web PHP + Supabase của Ngọc Hiếu qua EMQX MQTT.
 * Topic nhận lệnh từ Web: uth/iot/smartlocker/nhom4/cmd
 * Topic gửi trạng thái lên Web: uth/iot/smartlocker/nhom4/state
 */
#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <ESP32Servo.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHTesp.h"

#define LOCKER_ID       1
#define PIN_DHT         4
#define PIN_SERVO       13
#define PIN_COOLER      2   // LED Xanh - Sò lạnh Peltier
#define PIN_HEATER      15  // LED Đỏ - Thanh gia nhiệt PTC
#define PIN_ITEM_SW     5   // Công tắc trượt mô phỏng cảm biến hàng
#define PIN_BUZZER      12

const char* WIFI_SSID   = "Wokwi-GUEST";
const char* WIFI_PASS   = "";
const char* MQTT_BROKER = "broker.emqx.io";
const int   MQTT_PORT   = 1883;
const char* TOPIC_CMD   = "uth/iot/smartlocker/nhom4/cmd";
const char* TOPIC_STATE = "uth/iot/smartlocker/nhom4/state";

const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {19, 18, 17, 16};
byte colPins[COLS] = {25, 26, 27, 33};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
LiquidCrystal_I2C lcd(0x27, 20, 4);
DHTesp dht;
Servo lockServo;
WiFiClient espClient;
PubSubClient mqtt(espClient);

enum LockerState { IDLE, OPEN_DROP, STORING, OPEN_PICKUP, LOCKOUT };
LockerState currentState = IDLE;

String shipperOTP  = "184920";
String receiverOTP = "654321";
String inputOTP    = "";
String itemCategory = "NONE";
float targetTemp = 25.0;
float currentTemp = 25.0;
float currentHum = 55.0;
bool doorLocked = true;
bool tempActive = false;
int pwmPower = 0;
int wrongAttempts = 0;

unsigned long lastTelemetryMs = 0;
unsigned long lockoutStartMs = 0;

void beep(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

void setDoorLock(bool locked) {
  doorLocked = locked;
  lockServo.write(locked ? 0 : 90);
}

// [VẤN ĐÁP]: Tự động phân loại nhiệt độ từ chữ số đầu của Smart Prefix OTP (1=Lạnh, 2=Nóng, 3=Thường)
void applySmartPrefix(String otp, float explicitTarget) {
  char p = otp.length() > 0 ? otp.charAt(0) : '3';
  if (p == '1') {
    itemCategory = "DRINK";
    targetTemp = (explicitTarget > 0) ? explicitTarget : 5.0;
    tempActive = true;
  } else if (p == '2') {
    itemCategory = "HOT_FOOD";
    targetTemp = (explicitTarget > 0) ? explicitTarget : 55.0;
    tempActive = true;
  } else {
    itemCategory = "PARCEL";
    targetTemp = 25.0;
    tempActive = false;
  }
}

// [VẤN ĐÁP]: Điều khiển nhiệt độ Hysteresis ±1.0°C kèm ngắt an toàn Fail-safe (>75°C)
void runThermalControl() {
  if (!tempActive || isnan(currentTemp) || currentTemp > 75.0) {
    digitalWrite(PIN_COOLER, LOW);
    digitalWrite(PIN_HEATER, LOW);
    pwmPower = 0;
    return;
  }
  if (targetTemp <= 15.0) {
    digitalWrite(PIN_HEATER, LOW);
    if (currentTemp > targetTemp + 1.0) { digitalWrite(PIN_COOLER, HIGH); pwmPower = 100; }
    else if (currentTemp < targetTemp - 1.0) { digitalWrite(PIN_COOLER, LOW); pwmPower = 0; }
  } else if (targetTemp >= 35.0) {
    digitalWrite(PIN_COOLER, LOW);
    if (currentTemp < targetTemp - 1.0) { digitalWrite(PIN_HEATER, HIGH); pwmPower = 100; }
    else if (currentTemp > targetTemp + 1.0) { digitalWrite(PIN_HEATER, LOW); pwmPower = 0; }
  }
}

void publishState() {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> doc;
  doc["locker_id"] = LOCKER_ID;
  const char* stateNames[] = {"IDLE", "OPEN_DROP", "STORING", "OPEN_PICKUP", "LOCKOUT"};
  doc["state"] = stateNames[currentState];
  doc["category"] = itemCategory;
  doc["current_temp"] = round(currentTemp * 10.0) / 10.0;
  doc["target_temp"] = targetTemp;
  doc["humidity"] = round(currentHum * 10.0) / 10.0;
  doc["pwm_power"] = pwmPower;
  doc["door_locked"] = doorLocked;
  doc["has_item"] = (digitalRead(PIN_ITEM_SW) == HIGH);
  doc["wrong_attempts"] = wrongAttempts;
  doc["online"] = true;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_STATE, buf, true);
}

void updateLCD() {
  lcd.clear();
  lcd.setCursor(0, 0);
  if (currentState == IDLE) lcd.print("TU 01: SAN SANG");
  else if (currentState == OPEN_DROP) lcd.print("MO CUA BO HANG (D)");
  else if (currentState == STORING) lcd.print("BAO QUAN: " + itemCategory);
  else if (currentState == OPEN_PICKUP) lcd.print("MO CUA LAY HANG (D)");
  else lcd.print("!! KHOA AN NINH !!");

  lcd.setCursor(0, 1);
  lcd.print("T:" + String(currentTemp, 1) + "C -> " + String(targetTemp, 0) + "C");
  lcd.setCursor(0, 2);
  lcd.print("OTP (#=OK *=Xoa):");
  lcd.setCursor(0, 3);
  lcd.print("> " + inputOTP);
}

// Nhận lệnh Realtime từ Web PHP của Ngọc Hiếu
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  StaticJsonDocument<320> doc;
  if (deserializeJson(doc, msg)) return;

  int targetId = doc["locker_id"] | LOCKER_ID;
  if (targetId != LOCKER_ID) return;

  String cmd = doc["cmd"] | "";
  if (cmd == "CREATE_ORDER") {
    shipperOTP = doc["shipper_otp"] | shipperOTP;
    receiverOTP = doc["receiver_otp"] | receiverOTP;
    float t = doc["target_temp"] | 25.0;
    applySmartPrefix(shipperOTP, t);
    currentState = IDLE;
    beep(150);
  } else if (cmd == "REMOTE_UNLOCK") {
    setDoorLock(false);
    beep(250);
  } else if (cmd == "REMOTE_LOCK") {
    setDoorLock(true);
    if (doc["reset"] | false) {
      currentState = IDLE;
      tempActive = false;
      itemCategory = "NONE";
      wrongAttempts = 0;
    }
    beep(100);
  } else if (cmd == "SET_TEMP") {
    targetTemp = doc["target_temp"] | targetTemp;
    tempActive = (targetTemp != 25.0);
    beep(80);
  }
  updateLCD();
  publishState();
}

void reconnectMqtt() {
  if (mqtt.connected()) return;
  String cid = "esp32_sl_" + String(random(1000, 9999));
  if (mqtt.connect(cid.c_str())) {
    mqtt.subscribe(TOPIC_CMD, 1);
    publishState();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_COOLER, OUTPUT);
  pinMode(PIN_HEATER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_ITEM_SW, INPUT_PULLDOWN);

  dht.setup(PIN_DHT, DHTesp::DHT22);
  lockServo.attach(PIN_SERVO);
  setDoorLock(true);

  lcd.init();
  lcd.backlight();
  lcd.print("Ket noi WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(250);

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  reconnectMqtt();
  updateLCD();
}

void loop() {
  if (!mqtt.connected()) reconnectMqtt();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastTelemetryMs >= 2500) {
    lastTelemetryMs = now;
    TempAndHumidity d = dht.getTempAndHumidity();
    if (!isnan(d.temperature)) { currentTemp = d.temperature; currentHum = d.humidity; }
    if (currentState == STORING) runThermalControl();
    else { digitalWrite(PIN_COOLER, LOW); digitalWrite(PIN_HEATER, LOW); pwmPower = 0; }
    publishState();
    updateLCD();
  }

  if (currentState == LOCKOUT && now - lockoutStartMs >= 15000) {
    wrongAttempts = 0;
    currentState = (digitalRead(PIN_ITEM_SW) == HIGH) ? STORING : IDLE;
    updateLCD();
    publishState();
    return;
  }

  char key = keypad.getKey();
  if (!key || currentState == LOCKOUT) return;
  beep(50);

  if (key == '*') { inputOTP = ""; updateLCD(); }
  else if (key == '#') {
    if (currentState == IDLE && inputOTP == shipperOTP) {
      wrongAttempts = 0; inputOTP = ""; setDoorLock(false); currentState = OPEN_DROP;
      beep(200);
    } else if (currentState == STORING && inputOTP == receiverOTP) {
      wrongAttempts = 0; inputOTP = ""; setDoorLock(false); currentState = OPEN_PICKUP;
      beep(200);
    } else {
      wrongAttempts++; inputOTP = ""; beep(400);
      if (wrongAttempts >= 3) { currentState = LOCKOUT; lockoutStartMs = millis(); }
    }
    updateLCD();
    publishState();
  } else if (key == 'D') {
    if (currentState == OPEN_DROP && digitalRead(PIN_ITEM_SW) == HIGH) {
      setDoorLock(true); currentState = STORING; runThermalControl();
    } else if (currentState == OPEN_PICKUP && digitalRead(PIN_ITEM_SW) == LOW) {
      setDoorLock(true); currentState = IDLE; tempActive = false; itemCategory = "NONE";
    }
    updateLCD();
    publishState();
  } else if (key >= '0' && key <= '9' && inputOTP.length() < 6) {
    inputOTP += key;
    updateLCD();
  }
}
