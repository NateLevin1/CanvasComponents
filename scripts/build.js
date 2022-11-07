import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import glob from "glob";
import * as HTML from "node-html-parser";
import YAML from "yaml";
import * as HTMLMinifier from "html-minifier";
import CleanCSS from "clean-css";
import JS from "uglify-js";
import chalk from "chalk";

const CSS = new CleanCSS({});

console.log(chalk.gray("Building components..."));

glob("components/*.html", async (err, files) => {
    if (err) throw err;

    const canvasComponentsJs = await fs.readFile("canvascomponents.js", "utf8");

    // load components
    let components;
    try {
        components = await Promise.all(files.map(processComponent));
    } catch (e) {
        throw new Error("Error creating components: " + e);
    }

    const serializedComponents = components.map(JSON.stringify).join(",");
    console.log(chalk.cyan("Successfully built all components."));

    // create bookmarklet
    const fullJsStr = canvasComponentsJs.replace(
        "/*${CANVAS_COMPONENTS}*/",
        serializedComponents
    );

    const distDirectory = path.join(
        path.dirname(path.dirname(fileURLToPath(import.meta.url))),
        "dist/"
    );
    await fs.mkdir(distDirectory, { recursive: true });

    const minifiedJs = JS.minify(fullJsStr);
    if (minifiedJs.error) throw minifiedJs.error;

    const minifiedJsStr = minifiedJs.code;
    const bookmarkletJs = createBookmarklet(minifiedJsStr);

    await Promise.all([
        fs.writeFile(path.join(distDirectory, "bookmarklet"), bookmarkletJs),
        fs.writeFile(
            path.join(distDirectory, "canvascomponents.min.js"),
            minifiedJsStr
        ),
    ]);

    console.log(
        chalk.green("✓ Outputted bookmarklet to ./dist/bookmarklet.js!")
    );
});

/**
 * @param {string} filename
 */
async function processComponent(filename) {
    console.log(chalk.gray(`Building ${filename}...`));
    const file = await fs.readFile(filename);
    const root = HTML.parse(file);

    const config = YAML.parse(root.querySelector("config").innerHTML);
    const css = CSS.minify(root.querySelector("style").innerHTML);
    if (css.errors.length > 1) throw css.errors[0];
    const style = css.styles;
    const main = HTMLMinifier.minify(root.querySelector("main").innerHTML, {
        collapseWhitespace: true,
    });

    return {
        ...config,
        style,
        html: main,
    };
}

/**
 * @param {string} js
 */
function createBookmarklet(js) {
    return encodeURI("javascript:!function(){" + js + "}()");
}
