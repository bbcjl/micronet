from microbit import *
import radio

uart.init(115_200)

radio.config(
    length = 251,
    power = 7
)

display.show(Image.HAPPY)

while True:
    if uart.any():
        outData = uart.read(251)

        if outData != None:
            display.show(Image.ARROW_NE)
            radio.send_bytes(outData)

    inData = radio.receive_bytes()
    
    if inData != None:
        display.show(Image.ARROW_SE)
        uart.write(inData)