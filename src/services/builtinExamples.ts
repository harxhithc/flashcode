// Built-in Arduino Examples (Self-contained, bundled into client for 100% offline access)
import type { ExampleGroup, ExamplesResponse } from "./fs";

export const BUILTIN_EXAMPLES_DATA: Record<string, string> = {
  "builtin/01.Basics/AnalogReadSerial/AnalogReadSerial.ino": "// the setup routine runs once when you press reset:\nvoid setup() {\n  // initialize serial communication at 9600 bits per second:\n  Serial.begin(9600);\n}\n\n// the loop routine runs over and over again forever:\nvoid loop() {\n  // read the input on analog pin 0:\n  int sensorValue = analogRead(A0);\n  // print out the value you read:\n  Serial.println(sensorValue);\n  delay(1);  // delay in between reads for stability\n}\n",
  "builtin/01.Basics/BareMinimum/BareMinimum.ino": "void setup() {\n  // put your setup code here, to run once:\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n}\n",
  "builtin/01.Basics/Blink/Blink.ino": "// the setup function runs once when you press reset or power the board\nvoid setup() {\n  // initialize digital pin LED_BUILTIN as an output.\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\n// the loop function runs over and over again forever\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);  // turn the LED on (HIGH is the voltage level)\n  delay(1000);                      // wait for a second\n  digitalWrite(LED_BUILTIN, LOW);   // turn the LED off by making the voltage LOW\n  delay(1000);                      // wait for a second\n}\n",
  "builtin/01.Basics/DigitalReadSerial/DigitalReadSerial.ino": "// digital pin 2 has a pushbutton attached to it. Give it a name:\nint pushButton = 2;\n\n// the setup routine runs once when you press reset:\nvoid setup() {\n  // initialize serial communication at 9600 bits per second:\n  Serial.begin(9600);\n  // make the pushbutton pin an input:\n  pinMode(pushButton, INPUT);\n}\n\n// the loop routine runs over and over again forever:\nvoid loop() {\n  // read the input pin:\n  int buttonState = digitalRead(pushButton);\n  // print out the state of the button:\n  Serial.println(buttonState);\n  delay(1);  // delay in between reads for stability\n}\n",
  "builtin/01.Basics/Fade/Fade.ino": "int led = 9;         // the PWM pin the LED is attached to\nint brightness = 0;  // how bright the LED is\nint fadeAmount = 5;  // how many points to fade the LED by\n\nvoid setup() {\n  pinMode(led, OUTPUT);\n}\n\nvoid loop() {\n  analogWrite(led, brightness);\n  brightness = brightness + fadeAmount;\n\n  if (brightness <= 0 || brightness >= 255) {\n    fadeAmount = -fadeAmount;\n  }\n  delay(30);\n}\n",
  "builtin/01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.ino": "void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int sensorValue = analogRead(A0);\n  float voltage = sensorValue * (5.0 / 1023.0);\n  Serial.println(voltage);\n  delay(100);\n}\n",
  "builtin/02.Digital/BlinkWithoutDelay/BlinkWithoutDelay.ino": "const int ledPin = LED_BUILTIN;\nint ledState = LOW;\nunsigned long previousMillis = 0;\nconst long interval = 1000;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n}\n\nvoid loop() {\n  unsigned long currentMillis = millis();\n\n  if (currentMillis - previousMillis >= interval) {\n    previousMillis = currentMillis;\n    if (ledState == LOW) {\n      ledState = HIGH;\n    } else {\n      ledState = LOW;\n    }\n    digitalWrite(ledPin, ledState);\n  }\n}\n",
  "builtin/02.Digital/Button/Button.ino": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\nint buttonState = 0;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n  pinMode(buttonPin, INPUT);\n}\n\nvoid loop() {\n  buttonState = digitalRead(buttonPin);\n  if (buttonState == HIGH) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n}\n",
  "builtin/02.Digital/Debounce/Debounce.ino": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\n\nint ledState = HIGH;\nint buttonState;\nint lastButtonState = LOW;\n\nunsigned long lastDebounceTime = 0;\nunsigned long debounceDelay = 50;\n\nvoid setup() {\n  pinMode(buttonPin, INPUT);\n  pinMode(ledPin, OUTPUT);\n  digitalWrite(ledPin, ledState);\n}\n\nvoid loop() {\n  int reading = digitalRead(buttonPin);\n\n  if (reading != lastButtonState) {\n    lastDebounceTime = millis();\n  }\n\n  if ((millis() - lastDebounceTime) > debounceDelay) {\n    if (reading != buttonState) {\n      buttonState = reading;\n      if (buttonState == HIGH) {\n        ledState = !ledState;\n      }\n    }\n  }\n\n  digitalWrite(ledPin, ledState);\n  lastButtonState = reading;\n}\n",
  "builtin/02.Digital/DigitalInputPullup/DigitalInputPullup.ino": "void setup() {\n  Serial.begin(9600);\n  pinMode(2, INPUT_PULLUP);\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  int sensorVal = digitalRead(2);\n  Serial.println(sensorVal);\n\n  if (sensorVal == HIGH) {\n    digitalWrite(LED_BUILTIN, LOW);\n  } else {\n    digitalWrite(LED_BUILTIN, HIGH);\n  }\n}\n",
  "builtin/02.Digital/StateChangeDetection/StateChangeDetection.ino": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\n\nint buttonPushCounter = 0;\nint buttonState = 0;\nint lastButtonState = 0;\n\nvoid setup() {\n  pinMode(buttonPin, INPUT);\n  pinMode(ledPin, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  buttonState = digitalRead(buttonPin);\n  if (buttonState != lastButtonState) {\n    if (buttonState == HIGH) {\n      buttonPushCounter++;\n      Serial.print(\"number of button pushes: \");\n      Serial.println(buttonPushCounter);\n    }\n    delay(50);\n  }\n  lastButtonState = buttonState;\n\n  if (buttonPushCounter % 4 == 0) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n}\n",
  "builtin/03.Analog/AnalogInOutSerial/AnalogInOutSerial.ino": "const int analogInPin = A0;\nconst int analogOutPin = 9;\n\nint sensorValue = 0;\nint outputValue = 0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  sensorValue = analogRead(analogInPin);\n  outputValue = map(sensorValue, 0, 1023, 0, 255);\n  analogWrite(analogOutPin, outputValue);\n\n  Serial.print(\"sensor = \");\n  Serial.print(sensorValue);\n  Serial.print(\"\t output = \");\n  Serial.println(outputValue);\n  delay(2);\n}\n",
  "builtin/03.Analog/Fading/Fading.ino": "int ledPin = 9;\n\nvoid setup() {\n  // nothing happens in setup\n}\n\nvoid loop() {\n  for (int fadeValue = 0; fadeValue <= 255; fadeValue += 5) {\n    analogWrite(ledPin, fadeValue);\n    delay(30);\n  }\n  for (int fadeValue = 255; fadeValue >= 0; fadeValue -= 5) {\n    analogWrite(ledPin, fadeValue);\n    delay(30);\n  }\n}\n",
  "builtin/04.Communication/ASCIITable/ASCIITable.ino": "void setup() {\n  Serial.begin(9600);\n  while (!Serial) {\n    ; // wait for serial port to connect.\n  }\n  Serial.println(\"ASCII Table ~ Character Map\");\n}\n\nint thisByte = 33;\n\nvoid loop() {\n  Serial.write(thisByte);\n  Serial.print(\", dec: \");\n  Serial.print(thisByte);\n  Serial.print(\", hex: \");\n  Serial.print(thisByte, HEX);\n  Serial.print(\", oct: \");\n  Serial.print(thisByte, OCT);\n  Serial.print(\", bin: \");\n  Serial.println(thisByte, BIN);\n\n  if (thisByte == 126) {\n    while (true) {\n      continue;\n    }\n  }\n  thisByte++;\n}\n",
  "builtin/05.Control/IfStatementConditional/IfStatementConditional.ino": "const int sensorPin = A0;\nconst int ledPin = 13;\nconst int threshold = 400;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int analogValue = analogRead(sensorPin);\n  if (analogValue > threshold) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n  Serial.println(analogValue);\n  delay(1);\n}\n",
  "builtin/05.Control/switchCase/switchCase.ino": "const int sensorMin = 0;\nconst int sensorMax = 600;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int sensorReading = analogRead(A0);\n  int range = map(sensorReading, sensorMin, sensorMax, 0, 3);\n\n  switch (range) {\n    case 0:\n      Serial.println(\"dark\");\n      break;\n    case 1:\n      Serial.println(\"dim\");\n      break;\n    case 2:\n      Serial.println(\"medium\");\n      break;\n    case 3:\n      Serial.println(\"bright\");\n      break;\n  }\n  delay(1);\n}\n",
  "builtin/08.Strings/StringAdditionOperator/StringAdditionOperator.ino": "String stringOne, stringTwo, stringThree;\n\nvoid setup() {\n  Serial.begin(9600);\n  while (!Serial) {\n    ;\n  }\n  Serial.println(\"\\n\\nString Addition Operator:\");\n  stringOne = String(\"Sensor value: \");\n  stringTwo = String(analogRead(A0));\n  stringThree = stringOne + stringTwo;\n  Serial.println(stringThree);\n}\n\nvoid loop() {\n}\n",
};

export const BUILTIN_EXAMPLE_GROUP: ExampleGroup = {
  "id": "builtin",
  "title": "Built-in Examples",
  "categories": [
    {
      "name": "01.Basics",
      "examples": [
        {
          "name": "AnalogReadSerial",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/AnalogReadSerial",
          "inoPath": "builtin/01.Basics/AnalogReadSerial/AnalogReadSerial.ino",
          "content": "// the setup routine runs once when you press reset:\nvoid setup() {\n  // initialize serial communication at 9600 bits per second:\n  Serial.begin(9600);\n}\n\n// the loop routine runs over and over again forever:\nvoid loop() {\n  // read the input on analog pin 0:\n  int sensorValue = analogRead(A0);\n  // print out the value you read:\n  Serial.println(sensorValue);\n  delay(1);  // delay in between reads for stability\n}\n"
        },
        {
          "name": "BareMinimum",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/BareMinimum",
          "inoPath": "builtin/01.Basics/BareMinimum/BareMinimum.ino",
          "content": "void setup() {\n  // put your setup code here, to run once:\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n}\n"
        },
        {
          "name": "Blink",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/Blink",
          "inoPath": "builtin/01.Basics/Blink/Blink.ino",
          "content": "// the setup function runs once when you press reset or power the board\nvoid setup() {\n  // initialize digital pin LED_BUILTIN as an output.\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\n// the loop function runs over and over again forever\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);  // turn the LED on (HIGH is the voltage level)\n  delay(1000);                      // wait for a second\n  digitalWrite(LED_BUILTIN, LOW);   // turn the LED off by making the voltage LOW\n  delay(1000);                      // wait for a second\n}\n"
        },
        {
          "name": "DigitalReadSerial",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/DigitalReadSerial",
          "inoPath": "builtin/01.Basics/DigitalReadSerial/DigitalReadSerial.ino",
          "content": "// digital pin 2 has a pushbutton attached to it. Give it a name:\nint pushButton = 2;\n\n// the setup routine runs once when you press reset:\nvoid setup() {\n  // initialize serial communication at 9600 bits per second:\n  Serial.begin(9600);\n  // make the pushbutton pin an input:\n  pinMode(pushButton, INPUT);\n}\n\n// the loop routine runs over and over again forever:\nvoid loop() {\n  // read the input pin:\n  int buttonState = digitalRead(pushButton);\n  // print out the state of the button:\n  Serial.println(buttonState);\n  delay(1);  // delay in between reads for stability\n}\n"
        },
        {
          "name": "Fade",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/Fade",
          "inoPath": "builtin/01.Basics/Fade/Fade.ino",
          "content": "int led = 9;         // the PWM pin the LED is attached to\nint brightness = 0;  // how bright the LED is\nint fadeAmount = 5;  // how many points to fade the LED by\n\nvoid setup() {\n  pinMode(led, OUTPUT);\n}\n\nvoid loop() {\n  analogWrite(led, brightness);\n  brightness = brightness + fadeAmount;\n\n  if (brightness <= 0 || brightness >= 255) {\n    fadeAmount = -fadeAmount;\n  }\n  delay(30);\n}\n"
        },
        {
          "name": "ReadAnalogVoltage",
          "category": "01.Basics",
          "dirPath": "builtin/01.Basics/ReadAnalogVoltage",
          "inoPath": "builtin/01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.ino",
          "content": "void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int sensorValue = analogRead(A0);\n  float voltage = sensorValue * (5.0 / 1023.0);\n  Serial.println(voltage);\n  delay(100);\n}\n"
        }
      ]
    },
    {
      "name": "02.Digital",
      "examples": [
        {
          "name": "BlinkWithoutDelay",
          "category": "02.Digital",
          "dirPath": "builtin/02.Digital/BlinkWithoutDelay",
          "inoPath": "builtin/02.Digital/BlinkWithoutDelay/BlinkWithoutDelay.ino",
          "content": "const int ledPin = LED_BUILTIN;\nint ledState = LOW;\nunsigned long previousMillis = 0;\nconst long interval = 1000;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n}\n\nvoid loop() {\n  unsigned long currentMillis = millis();\n\n  if (currentMillis - previousMillis >= interval) {\n    previousMillis = currentMillis;\n    if (ledState == LOW) {\n      ledState = HIGH;\n    } else {\n      ledState = LOW;\n    }\n    digitalWrite(ledPin, ledState);\n  }\n}\n"
        },
        {
          "name": "Button",
          "category": "02.Digital",
          "dirPath": "builtin/02.Digital/Button",
          "inoPath": "builtin/02.Digital/Button/Button.ino",
          "content": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\nint buttonState = 0;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n  pinMode(buttonPin, INPUT);\n}\n\nvoid loop() {\n  buttonState = digitalRead(buttonPin);\n  if (buttonState == HIGH) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n}\n"
        },
        {
          "name": "Debounce",
          "category": "02.Digital",
          "dirPath": "builtin/02.Digital/Debounce",
          "inoPath": "builtin/02.Digital/Debounce/Debounce.ino",
          "content": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\n\nint ledState = HIGH;\nint buttonState;\nint lastButtonState = LOW;\n\nunsigned long lastDebounceTime = 0;\nunsigned long debounceDelay = 50;\n\nvoid setup() {\n  pinMode(buttonPin, INPUT);\n  pinMode(ledPin, OUTPUT);\n  digitalWrite(ledPin, ledState);\n}\n\nvoid loop() {\n  int reading = digitalRead(buttonPin);\n\n  if (reading != lastButtonState) {\n    lastDebounceTime = millis();\n  }\n\n  if ((millis() - lastDebounceTime) > debounceDelay) {\n    if (reading != buttonState) {\n      buttonState = reading;\n      if (buttonState == HIGH) {\n        ledState = !ledState;\n      }\n    }\n  }\n\n  digitalWrite(ledPin, ledState);\n  lastButtonState = reading;\n}\n"
        },
        {
          "name": "DigitalInputPullup",
          "category": "02.Digital",
          "dirPath": "builtin/02.Digital/DigitalInputPullup",
          "inoPath": "builtin/02.Digital/DigitalInputPullup/DigitalInputPullup.ino",
          "content": "void setup() {\n  Serial.begin(9600);\n  pinMode(2, INPUT_PULLUP);\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  int sensorVal = digitalRead(2);\n  Serial.println(sensorVal);\n\n  if (sensorVal == HIGH) {\n    digitalWrite(LED_BUILTIN, LOW);\n  } else {\n    digitalWrite(LED_BUILTIN, HIGH);\n  }\n}\n"
        },
        {
          "name": "StateChangeDetection",
          "category": "02.Digital",
          "dirPath": "builtin/02.Digital/StateChangeDetection",
          "inoPath": "builtin/02.Digital/StateChangeDetection/StateChangeDetection.ino",
          "content": "const int buttonPin = 2;\nconst int ledPin = LED_BUILTIN;\n\nint buttonPushCounter = 0;\nint buttonState = 0;\nint lastButtonState = 0;\n\nvoid setup() {\n  pinMode(buttonPin, INPUT);\n  pinMode(ledPin, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  buttonState = digitalRead(buttonPin);\n  if (buttonState != lastButtonState) {\n    if (buttonState == HIGH) {\n      buttonPushCounter++;\n      Serial.print(\"number of button pushes: \");\n      Serial.println(buttonPushCounter);\n    }\n    delay(50);\n  }\n  lastButtonState = buttonState;\n\n  if (buttonPushCounter % 4 == 0) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n}\n"
        }
      ]
    },
    {
      "name": "03.Analog",
      "examples": [
        {
          "name": "AnalogInOutSerial",
          "category": "03.Analog",
          "dirPath": "builtin/03.Analog/AnalogInOutSerial",
          "inoPath": "builtin/03.Analog/AnalogInOutSerial/AnalogInOutSerial.ino",
          "content": "const int analogInPin = A0;\nconst int analogOutPin = 9;\n\nint sensorValue = 0;\nint outputValue = 0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  sensorValue = analogRead(analogInPin);\n  outputValue = map(sensorValue, 0, 1023, 0, 255);\n  analogWrite(analogOutPin, outputValue);\n\n  Serial.print(\"sensor = \");\n  Serial.print(sensorValue);\n  Serial.print(\"\t output = \");\n  Serial.println(outputValue);\n  delay(2);\n}\n"
        },
        {
          "name": "Fading",
          "category": "03.Analog",
          "dirPath": "builtin/03.Analog/Fading",
          "inoPath": "builtin/03.Analog/Fading/Fading.ino",
          "content": "int ledPin = 9;\n\nvoid setup() {\n  // nothing happens in setup\n}\n\nvoid loop() {\n  for (int fadeValue = 0; fadeValue <= 255; fadeValue += 5) {\n    analogWrite(ledPin, fadeValue);\n    delay(30);\n  }\n  for (int fadeValue = 255; fadeValue >= 0; fadeValue -= 5) {\n    analogWrite(ledPin, fadeValue);\n    delay(30);\n  }\n}\n"
        }
      ]
    },
    {
      "name": "04.Communication",
      "examples": [
        {
          "name": "ASCIITable",
          "category": "04.Communication",
          "dirPath": "builtin/04.Communication/ASCIITable",
          "inoPath": "builtin/04.Communication/ASCIITable/ASCIITable.ino",
          "content": "void setup() {\n  Serial.begin(9600);\n  while (!Serial) {\n    ; // wait for serial port to connect.\n  }\n  Serial.println(\"ASCII Table ~ Character Map\");\n}\n\nint thisByte = 33;\n\nvoid loop() {\n  Serial.write(thisByte);\n  Serial.print(\", dec: \");\n  Serial.print(thisByte);\n  Serial.print(\", hex: \");\n  Serial.print(thisByte, HEX);\n  Serial.print(\", oct: \");\n  Serial.print(thisByte, OCT);\n  Serial.print(\", bin: \");\n  Serial.println(thisByte, BIN);\n\n  if (thisByte == 126) {\n    while (true) {\n      continue;\n    }\n  }\n  thisByte++;\n}\n"
        }
      ]
    },
    {
      "name": "05.Control",
      "examples": [
        {
          "name": "IfStatementConditional",
          "category": "05.Control",
          "dirPath": "builtin/05.Control/IfStatementConditional",
          "inoPath": "builtin/05.Control/IfStatementConditional/IfStatementConditional.ino",
          "content": "const int sensorPin = A0;\nconst int ledPin = 13;\nconst int threshold = 400;\n\nvoid setup() {\n  pinMode(ledPin, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int analogValue = analogRead(sensorPin);\n  if (analogValue > threshold) {\n    digitalWrite(ledPin, HIGH);\n  } else {\n    digitalWrite(ledPin, LOW);\n  }\n  Serial.println(analogValue);\n  delay(1);\n}\n"
        },
        {
          "name": "switchCase",
          "category": "05.Control",
          "dirPath": "builtin/05.Control/switchCase",
          "inoPath": "builtin/05.Control/switchCase/switchCase.ino",
          "content": "const int sensorMin = 0;\nconst int sensorMax = 600;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int sensorReading = analogRead(A0);\n  int range = map(sensorReading, sensorMin, sensorMax, 0, 3);\n\n  switch (range) {\n    case 0:\n      Serial.println(\"dark\");\n      break;\n    case 1:\n      Serial.println(\"dim\");\n      break;\n    case 2:\n      Serial.println(\"medium\");\n      break;\n    case 3:\n      Serial.println(\"bright\");\n      break;\n  }\n  delay(1);\n}\n"
        }
      ]
    },
    {
      "name": "08.Strings",
      "examples": [
        {
          "name": "StringAdditionOperator",
          "category": "08.Strings",
          "dirPath": "builtin/08.Strings/StringAdditionOperator",
          "inoPath": "builtin/08.Strings/StringAdditionOperator/StringAdditionOperator.ino",
          "content": "String stringOne, stringTwo, stringThree;\n\nvoid setup() {\n  Serial.begin(9600);\n  while (!Serial) {\n    ;\n  }\n  Serial.println(\"\\n\\nString Addition Operator:\");\n  stringOne = String(\"Sensor value: \");\n  stringTwo = String(analogRead(A0));\n  stringThree = stringOne + stringTwo;\n  Serial.println(stringThree);\n}\n\nvoid loop() {\n}\n"
        }
      ]
    }
  ],
  "totalCount": 17
};

export function getBuiltinExamples(): ExamplesResponse {
  return {
    success: true,
    groups: [BUILTIN_EXAMPLE_GROUP],
    total: 17
  };
}
