const express = require("express");
const path = require("path");

const app = express();
const PORT = 8080;

// static file
app.use(express.static(__dirname));

// rewrite: /fileA -> /fileA.html
app.get("/:page", (req, res, next) => {
  const filePath = path.join(__dirname, req.params.page + ".html");
  res.sendFile(filePath, (err) => {
    if (err) next(); // lanjut kalau gak ada
  });
});

app.listen(PORT, () => {
  console.log("Server jalan di http://localhost:" + PORT);
});
