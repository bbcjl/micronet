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

# display.show(Image.HAPPY)
display.clear()

inbox = []
modemMessage = bytearray()
modemCommand = 0
modemInPayload = False
modemPayloadLength = 0

messagesSent = 0
messagesReceived = 0

def showProgress(y, value, backwards = False):
    iterable = range(0, 5) if not backwards else range(4, -1, -1)

    for x in iterable:
        valueX = 4 - x if backwards else x

        display.set_pixel(x, y, 9 if value % 5 == valueX else 0)

def handleModemCommand(data):
    global messagesSent

    if modemCommand == 1:
        # display.show(Image.ARROW_NE)
        radio.send_bytes(data)

        messagesSent += 1

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

        if not modemInPayload and len(modemMessage) >= 5:
            if (
                modemMessage[0] == ord("m") and
                modemMessage[1] == ord("m") and
                modemMessage[2] == 1
            ):
                modemCommand = modemMessage[3]
                modemInPayload = True
                modemPayloadLength = modemMessage[4]
                modemMessage = modemMessage[5:]
            else:
                modemMessage = modemMessage[1:]

    inData = radio.receive_bytes()
    
    if inData != None:
        messagesReceived += 1

        # display.show(Image.ARROW_SE)
        uart.write(b'MM\x01\x01')
        uart.write(bytearray([len(inData)]))
        uart.write(inData)

    showProgress(0, messagesSent)
    showProgress(4, messagesReceived, True)