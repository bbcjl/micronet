const fs = require("fs");
const path = require("path");
const htmlMinifier = require("html-minifier");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const Handlebars = require("handlebars");
const {glob} = require("glob");

(async function() {
    var sourceFiles = await glob("docssrc/*", {ignore: "docssrc/partials/**"});
    var partialFiles = await glob("docssrc/partials/*");

    partialFiles.forEach(function(partialFile) {
        var partialPath = partialFile.split("/");

        Handlebars.registerPartial(partialPath[partialPath.length - 1].split(".")[0], fs.readFileSync(partialFile, "utf-8"));
    });

    Handlebars.registerHelper("equals", function(a, b, options) {
        if (a == b) {
            return options.fn(this);
        }

        return options.inverse(this);
    });

    sourceFiles.forEach(function(sourceFile) {
        var sourcePath = sourceFile.split("/");

        sourcePath.shift();

        var data = fs.readFileSync(sourceFile, "utf-8");
        var destinationPath = path.join("docs", ...sourcePath);

        if (!sourceFile.endsWith(".handlebars") && !sourceFile.endsWith(".css") && !sourceFile.endsWith(".js")) {
            fs.writeFileSync(destinationPath, data);

            return;
        }

        var minifiedData = data;

        if (sourceFile.endsWith(".handlebars")) {
            var template = Handlebars.compile(data);

            const pages = [
                {id: "index", name: "home"},
                {id: "getstarted", name: "get started"},
                {id: "protocol", name: "protocol spec"}
            ];

            const pageId = sourcePath[sourcePath.length - 1].split(".")[0];

            data = template({
                pages,
                page: pages.find((page) => page.id == pageId)
            });

            minifiedData = htmlMinifier.minify(data, {collapseWhitespace: true});
            destinationPath = destinationPath.replace(/\.handlebars$/, ".html");
        } else if (sourceFile.endsWith(".css")) {
            minifiedData = new CleanCSS().minify(data).styles;
        } else if (sourceFile.endsWith(".js")) {
            minifiedData = UglifyJS.minify(data).code;
        }

        fs.writeFileSync(destinationPath, minifiedData);
    });
})();