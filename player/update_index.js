const fs = require("fs");
const filename = process.argv[2];

let content = null;

try {
  fs.readFile(filename, "utf8", function (err, md) {
    if (err) {
      console.error(`Cannot read input file "${filename}"`);
    }

    const { Remarkable } = require("remarkable");
    var renderer = new Remarkable();

    content = renderer.render(md);
  });
} catch (err) {
  console.error(
    filename ? `Cannot read input file "${filename}"` : "Missing input file"
  );
}

try {
  fs.readFile("src/templates/index.template.html", "utf8", function (
    err,
    index
  ) {
    if (err) {
      console.error(`Cannot read input template file`);
    }

    fs.writeFile(
      "public/index.html",
      index.replace(/<content \/>/, content),
      (err) => {
        if (err) {
          console.error("Cannot write public/index.html");
        }

        console.log("public/index.html saved!");
      }
    );
    console.log();
  });
} catch (err) {
  console.error("Cannot read input template file");
}
