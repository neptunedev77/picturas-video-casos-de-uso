var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const mongoose = require("mongoose");

const { router: projectsRouter, process_msg } = require("./routes/projects");
const { router: silenceRouter, startSilenceConsumer } = require("./routes/silence");
const { router: compressionRouter, startCompressionConsumer } = require("./routes/compression");
const { router: subtitlesRouter } = require("./routes/subtitles");
const { startSubtitleConsumer } = require("./utils/subtitles_mq");

// Run Docker
const mongoDB = "mongodb://projects_mongoDB:27018/project";

mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on("error", console.error.bind(console, "Error connecting to Mongodb"));
db.once("open", () => {
  console.log("Mongodb connection successful");
});

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// UC-VID-001: remoção de silêncios (rotas /:user/:project/silence/:img...)
app.use("/", silenceRouter);
app.use("/", compressionRouter);
app.use("/", subtitlesRouter);
app.use("/", projectsRouter);

// Start the message processing
process_msg();
startSilenceConsumer();
startCompressionConsumer();
startSubtitleConsumer();

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500).jsonp(err);
});

module.exports = app;
