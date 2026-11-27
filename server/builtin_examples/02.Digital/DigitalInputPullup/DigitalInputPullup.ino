void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  int sensorVal = digitalRead(2);
  Serial.println(sensorVal);

  if (sensorVal == HIGH) {
    digitalWrite(LED_BUILTIN, LOW);
  } else {
    digitalWrite(LED_BUILTIN, HIGH);
  }
}
