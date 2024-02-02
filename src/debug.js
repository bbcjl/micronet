exports.DEBUGGING = true;

exports.log = function() {
    if (!exports.DEBUGGING) {
        return;
    }

    console.log(...arguments);
};