const {SerialPort} = require("serialport");
const args = require("minimist")(process.argv.slice(2));

var common = require("./common");
var conversations = require("./conversations");

const IS_SERVER = args["serial-port"] == "/dev/ttyACM1";

var port = new SerialPort({
    path: args["serial-port"] || "/dev/ttyACM0",
    baudRate: Number(args["baud-rate"]) || 115_200
});

var dataStream = Buffer.alloc(0);
var modemCommand = null;
var modemPayloadLength = 0;

var manager = new conversations.ConversationManager(IS_SERVER ? 0x0BBC : 0xAAAA);

manager.requestHandler = function(payload) {
    console.log("Received request:", payload.toString());

    return Promise.resolve(Buffer.from("Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."));
};

port.on("open", function() {
    console.log(`Modem connected; micro:net is up! (ID ${common.hex(manager.id)})`);

    // setInterval(function() {
    //     port.write("mm");
    //     port.write(Buffer.from([0x01, 0x01, 4]));
    //     port.write("test");
    //     manager.update();
    // }, 1000);

    if (!IS_SERVER) {
        manager.createRequest(0x0BBC, Buffer.from("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque eget nisl ut tellus tincidunt mollis. Mauris efficitur consequat pellentesque. Suspendisse dignissim est nunc. Curabitur venenatis eleifend tincidunt. Nunc laoreet rutrum nisi, ac efficitur lectus sodales non. Quisque id sapien hendrerit risus venenatis finibus. Mauris non arcu eu ipsum mollis ullamcorper. Nullam semper in lectus at luctus. Pellentesque luctus mi ut erat viverra vulputate. Suspendisse vestibulum urna orci, non varius libero efficitur eget. Cras maximus turpis mi, ut lobortis purus pharetra at. Vestibulum mattis eros eu lectus facilisis vehicula. Vestibulum cursus ac tellus eget porttitor. Duis id ullamcorper mi.")).then(function(payload) {
            console.log("Received response:", payload.toString());
        });
    }

    setInterval(function() {
        if (manager.hasMessagesInOutbox) {
            var message = manager.getMessageFromOutbox();

            port.write("mm");
            port.write(Buffer.from([0x01, 0x01, message.length]));
            port.write(message);
        }

        manager.update();
    });
});

port.on("data", function(data) {
    dataStream = Buffer.concat([dataStream, data]);

    if (modemCommand == null && dataStream.length >= 5) {
        if (dataStream.subarray(0, 3).equals(Buffer.from([0x4D, 0x4D, 0x01]))) {
            modemCommand = dataStream[3];
            modemPayloadLength = dataStream[4] || 0;

            dataStream = dataStream.subarray(5);
        } else {
            dataStream = dataStream.subarray(1);
        }
    }

    if (modemCommand != null && dataStream.length >= modemPayloadLength) {
        var data = dataStream.subarray(0, modemPayloadLength);

        switch (modemCommand) {
            case 0x01:
                manager.addMessageToInbox(data);
                break;
    
            default:
                console.warn(`Unknown micro:modem command: ${common.hex(modemCommand, 2)}`);
                break;
        }

        dataStream = dataStream.subarray(modemPayloadLength);
        modemCommand = null;
        modemPayloadLength = 0;

        return;
    }
});