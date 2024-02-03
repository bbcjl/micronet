from microbit import *
import micropython
import radio

display.show("A")

while not button_a.is_pressed(): pass

micropython.kbd_intr(-1)

uart.init(115_200)

radio.config(
    length = 251,
    power = 7,
    channel = 16
)

display.show(Image.HAPPY)

inbox = []
modemMessage = bytearray()
modemCommand = 0
modemInPayload = False
modemPayloadLength = 0

def handleModemCommand(data):
    if modemCommand == 1:
        display.show(Image.ARROW_NE)
        radio.send_bytes(data)

while True:
    if uart.any():
        byte = uart.read()

        if byte != None:
            modemMessage.extend(byte)

        if len(modemMessage) > 256:
            modemMessage = bytearray()

            continue

        if modemInPayload and len(modemMessage) >= modemPayloadLength:
            handleModemCommand(modemMessage[:modemPayloadLength])

            modemMessage = modemMessage[modemPayloadLength:]
            modemCommand = 0
            modemInPayload = False
            modemPayloadLength = 0

        if not modemInPayload:
            if (
                len(modemMessage) >= 5 and
                modemMessage[0] == ord("m") and
                modemMessage[1] == ord("m") and
                modemMessage[2] == 1
            ):
                modemCommand = modemMessage[3]
                modemInPayload = True
                modemPayloadLength = modemMessage[4]
                modemMessage = modemMessage[5:]
            else:
                modemMessage = bytearray()

    inData = radio.receive_bytes()
    
    if inData != None:
        display.show(Image.ARROW_SE)
        uart.write(b'MM\x01\x01')
        uart.write(bytearray([len(inData)]))
        uart.write(inData)