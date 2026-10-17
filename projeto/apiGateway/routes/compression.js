const express = require("express");
const axios = require("axios");
const https = require("https");
const auth = require("../auth/auth");
const router = express.Router();
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const base = "/:user/:project/compression";

async function forward(req, res) {
  // Compression is owner-only; ignore no owner overrides or share links.
  if (req.query.share || req.query.owner) {
    return res.status(403).json({ code: "OWNER_ONLY", message: "Compression is owner-only." });
  }
  const suffix = req.params.jobId
    ? `/${req.params.jobId}${req.path.endsWith("/result") ? "/result" : req.path.endsWith("/cancel") ? "/cancel" : ""}` : "";
  try {
    const response = await axios({
      method: req.method,
      url: `https://projects:9001/${req.params.user}/${req.params.project}/compression${suffix}`,
      data: req.method === "POST" ? req.body : undefined,
      headers: {
        Authorization: req.headers.authorization,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      httpsAgent,
      responseType: "stream",
      validateStatus: () => true,
      timeout: 30000,
    });
    res.status(response.status);
    for (const name of ["content-type", "content-length", "content-disposition", "content-range", "accept-ranges"]) {
      if (response.headers[name]) res.set(name, response.headers[name]);
    }
    res.set("Cache-Control", "private, no-store");
    res.on("close", () => response.data.destroy());
    response.data.on("error", () => res.destroy());
    response.data.pipe(res);
  } catch (_) {
    if (!res.headersSent) res.status(502).json({ code: "PROJECTS_UNAVAILABLE", message: "Projects service unavailable." });
  }
}

router.post(base, auth.checkToken, forward);
router.get(base, auth.checkToken, forward);
router.get(`${base}/:jobId`, auth.checkToken, forward);
router.get(`${base}/:jobId/result`, auth.checkToken, forward);
router.post(`${base}/:jobId/cancel`, auth.checkToken, forward);
module.exports = router;
