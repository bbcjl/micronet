from microbit import *
import micropython
import radio

uart.init(115_200)

display.show("?")

while True:
    data = uart.read(1)

    if data != None and data[0] == ord("@"):
        break

uart.write(b'!')

micropython.kbd_intr(-1)

radio.config(
    length = 251,
    power = 7,
    channel = 16
)

display.clear()

inbox = []
modemMessage = bytearray()
modemCommand = 0
modemInPayload = False
modemPayloadLength = 0

messagesSent = 0
messagesReceived = 0
requestResponseProgress = 0
openConversations = 0

def showTransferProgress(y, value, backwards = False):
    iterable = range(0, 5) if not backwards else range(4, -1, -1)

    for x in iterable:
        valueX = 4 - x if backwards else x

        display.set_pixel(x, y, 9 if value % 5 == valueX else 0)

def showLights(y, value, maxValue = 5):
    for i in range(0, maxValue):
        display.set_pixel(
            i % 5,
            y + (i // 5),
            9 if i < value else 0
        )

def handleModemCommand(data):
    global messagesSent, requestResponseProgress, openConversations

    if modemCommand == 1:
        radio.send_bytes(data)

        messagesSent += 1

    if modemCommand == 2:
        requestResponseProgress = data[0]

    if modemCommand == 3:
        openConversations = data[0]

while True:
    if uart.any():
        inSerial = uart.read()

        if inSerial != None:
            modemMessage.extend(inSerial)

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

        uart.write(b'MM\x01\x01')
        uart.write(bytearray([len(inData)]))
        uart.write(inData)

    showLights(0, requestResponseProgress, 10)
    showLights(2, openConversations)
    showTransferProgress(3, messagesSent)
    showTransferProgress(4, messagesReceived, True)