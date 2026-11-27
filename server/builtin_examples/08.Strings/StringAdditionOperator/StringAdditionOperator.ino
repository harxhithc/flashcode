String stringOne, stringTwo, stringThree;

void setup() {
  Serial.begin(9600);
  while (!Serial) {
    ;
  }
  Serial.println("\n\nString Addition Operator:");
  stringOne = String("Sensor value: ");
  stringTwo = String(analogRead(A0));
  stringThree = stringOne + stringTwo;
  Serial.println(stringThree);
}

void loop() {
}
