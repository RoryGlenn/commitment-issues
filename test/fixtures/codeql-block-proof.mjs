// Disposable CodeQL merge-protection proof for issue #177.
// This branch must never be merged.
import { exec } from "node:child_process";
import express from "express";

const app = express();
app.get("/", (request, response) => {
  exec(request.query.command);
  response.send("CodeQL block proof");
});
app.listen(3000);
