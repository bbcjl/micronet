const fs = require("fs");
const path = require("path");
const htmlMinifier = require("html-minifier");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const {glob} = require("glob");

(async function() {
    var sourceFiles = await glob("docssrc/*");

    sourceFiles.forEach(function(sourceFile) {
        var sourcePath = sourceFile.split("/");

        sourcePath.shift();

        var data = fs.readFileSync(sourceFile, "utf-8");
        var minifiedData = data;

        if (sourceFile.endsWith(".html")) {
            minifiedData = htmlMinifier.minify(data, {collapseWhitespace: true});
        } else if (sourceFile.endsWith(".css")) {
            minifiedData = new CleanCSS().minify(data);
        } else if (sourceFile.endsWith(".js")) {
            minifiedData = UglifyJS.minify(data);
        }

        fs.writeFileSync(path.join("docs", ...sourcePath), minifiedData);
    });
})();