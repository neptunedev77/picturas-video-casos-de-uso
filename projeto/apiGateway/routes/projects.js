var express = require("express");
var router = express.Router();

const axios = require("axios");

const https = require("https");
const fs = require("fs");

const multer = require("multer");
const FormData = require("form-data");

const auth = require("../auth/auth");

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "video/mp4",
];

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

const projectsURL = "https://projects:9001/";

function forwardAxiosError(res, err, fallbackMsg) {
  const status = err.response?.status || 500;
  const data =
    err.response?.data ||
    (err.code === "ECONNREFUSED" ? "Projects service unavailable" : fallbackMsg);

  // reenviar versão se existir
  const v = err.response?.headers?.["x-project-version"];
  if (v) res.set("X-Project-Version", v);

  console.error("[API-GW]", status, fallbackMsg, {
    data: err.response?.data,
    message: err.message,
  });

  return res.status(status).jsonp(data);
}

// TODO Verify jwt

/*
Project structure
{
    "_id": Mongoose.type.id,
    "user_id": Mongoose.type.id,
    "name": String,
    "imgs": [Image Structure],
    "tools": [Tool Structure],
}

Image structure
{
    "_id": Mongoose.type.id,
    "og_uri": String,
    "new_uri": String
}

Tool structure
{
    "_id": Mongoose.type._id,
    "position": Number,
    "procedure": String,
    "params": Object
}

Post answer structure in case of success
{
    "acknowledged": Bool,
    "modifiedCount": Number,
    "upsertedId": null,
    "upsertedCount": Number,
    "matchedCount": Number
}
*/

/**
 * Note: auth.checkToken is a midleware used to verify JWT
 */

// listar links de um projeto (só dono) – protegido
/**
 * UC-VID-001: remoção de silêncios de um vídeo
 *   GET  /:user/:project/silence/:img          estado (análise, revisão, progresso, resultado)
 *   POST /:user/:project/silence/:img/analyze  { options, confirmDiscard }
 *   PUT  /:user/:project/silence/:img/review   { segments }
 *   POST /:user/:project/silence/:img/apply    { segments, confirmLargeRemoval }
 *   POST /:user/:project/silence/:img/cancel
 */
function forwardSilence(req, res) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;
  const action = req.params.action ? `/${req.params.action}` : "";

  axios({
    method: req.method,
    url: projectsURL + `${ownerId}/${req.params.project}/silence/${req.params.img}${action}`,
    data: req.method === "GET" ? undefined : req.body,
    httpsAgent,
    params: req.query.share ? { share: req.query.share } : undefined,
    headers: {
      Authorization: req.headers["authorization"],
      "X-Caller-Id": callerId,
    },
  })
    .then((resp) => res.status(resp.status).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "Erro no serviço de remoção de silêncios"));
}

router.get("/:user/:project/silence/:img", auth.checkToken, forwardSilence);
router.post("/:user/:project/silence/:img/:action(analyze|apply|cancel)", auth.checkToken, forwardSilence);
router.put("/:user/:project/silence/:img/:action(review)", auth.checkToken, forwardSilence);

// UC-VID-004: authenticate and proxy the existing Project Service contract.
// Owner/share resolution follows forwardSilence; the caller comes from the JWT.
async function forwardSubtitles(req, res) {
  const ownerId = req.query.owner || req.params.user;
  const parts = [ownerId, req.params.project, "subtitles", req.params.jobId, req.params.action]
    .filter(part => part !== undefined).map(part => encodeURIComponent(String(part)));
  try {
    const response = await axios({
      method: req.method,
      url: projectsURL + parts.join("/"),
      data: req.method === "GET" ? undefined : req.body,
      params: req.query,
      headers: { Authorization: req.headers.authorization, "X-Caller-Id": req.authUserId },
      httpsAgent,
      timeout: 15000,
      validateStatus: () => true,
    });
    if (response.headers["cache-control"]) res.set("Cache-Control", response.headers["cache-control"]);
    if (response.status >= 500) {
      // Preserve status and safe correlation, never upstream stack/HTML/details.
      const code = typeof response.data?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(response.data.code)
        ? response.data.code : "PROJECTS_ERROR";
      const jobId = typeof response.data?.jobId === "string" && /^[0-9a-f-]{36}$/.test(response.data.jobId)
        ? response.data.jobId : undefined;
      return res.status(response.status).json({ code, jobId, message: "O serviço de projetos não conseguiu concluir o pedido." });
    }
    const data = response.status >= 400
      ? JSON.parse(JSON.stringify(response.data ?? null, (key, value) => /^(stack|stacktrace|stack_trace)$/i.test(key) ? undefined : value))
      : response.data;
    return res.status(response.status).json(data);
  } catch (err) {
    const timeout = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";
    return res.status(timeout ? 504 : 503).json({
      code: timeout ? "PROJECTS_TIMEOUT" : "PROJECTS_UNAVAILABLE",
      message: timeout ? "O serviço de projetos excedeu o tempo de resposta." : "O serviço de projetos está indisponível.",
    });
  }
}

const subtitleBase = "/:user/:project/subtitles";
router.post(subtitleBase, auth.checkToken, forwardSubtitles);
router.get(`${subtitleBase}/:jobId`, auth.checkToken, forwardSubtitles);
router.post(`${subtitleBase}/:jobId/:action(confirm|reject|cancel)`, auth.checkToken, forwardSubtitles);

router.get("/:user/:project/share", auth.checkToken, (req, res) => {
  axios
    .get(projectsURL + `${req.params.user}/${req.params.project}/share`, {
      httpsAgent,
      headers: { Authorization: req.headers["authorization"] },
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

});

// criar link de partilha
router.post("/:user/:project/share", auth.checkToken, (req, res) => {
    const callerId = req.authUserId || req.params.user;
  axios
    .post(
      projectsURL + `${req.params.user}/${req.params.project}/share`,
      req.body,
      {
        httpsAgent,
        headers: { 
          Authorization: req.headers["authorization"], 
          "X-Project-Version": req.headers["x-project-version"],
          "X-Caller-Id": callerId,
        },
      },
    )

    .then((resp) => {
          if (resp.headers?.["x-project-version"]) {
            res.set("X-Project-Version", resp.headers["x-project-version"]);
          }
          return res.status(201).jsonp(resp.data);
        })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

});

// resolver link de partilha (PÚBLICO – sem auth)
// devolve { projectId, ownerId, permission }
router.get("/share/:shareId", (req, res) => {
  axios
    .get(projectsURL + `share/${req.params.shareId}`, { httpsAgent })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "Error resolving share link"));
});

// obter projeto completo via shareId (PROTEGIDO – requer JWT)
router.get("/share/:shareId/project", auth.checkToken, (req, res) => {
  const callerId = req.authUserId;

  axios
    .get(projectsURL + `share/${req.params.shareId}/project`, {
      httpsAgent,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "Error getting shared project"));
});



// revogar link de partilha (dono, protegido)
router.delete("/:user/:project/share/:shareId", auth.checkToken, (req, res) => {
  const callerId = req.authUserId || req.params.user;

  axios
    .delete(
      projectsURL + `${req.params.user}/${req.params.project}/share/${req.params.shareId}`,
      {
        httpsAgent,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Project-Version": req.headers["x-project-version"],
          "X-Caller-Id": callerId,
        },
      }
    )
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
});

/**
 * Get user's projects
 * @body Empty
 * @returns List of projects, each project has no information about it's images or tools
 */
router.get("/:user", auth.checkToken, function (req, res, next) {
  const callerId = req.authUserId || req.params.user;

  axios
    .get(projectsURL + `${req.params.user}`, {
      httpsAgent,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
});

/**
 * Get user's project
 * @body Empty
 * @returns The required project
 */
router.get("/:user/:project", auth.checkToken, function (req, res, next) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .get(projectsURL + `${ownerId}/${req.params.project}`, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => res.status(200).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
});


/**
 * Get project image
 * @body Empty
 * @returns The image url
 */
router.get(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .get(projectsURL + `${ownerId}/${req.params.project}/img/${req.params.img}`, {
        httpsAgent,
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Caller-Id": callerId,
        },
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
  }
);

/**
 * Get project images
 * @body Empty
 * @returns The project's images
 */
router.get("/:user/:project/imgs", auth.checkToken, function (req, res, next) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .get(projectsURL + `${ownerId}/${req.params.project}/imgs`, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => res.status(200).send(resp.data))
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
});


/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as a zip
 */
router.get(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .get(projectsURL + `${ownerId}/${req.params.project}/process`, {
        httpsAgent,
        responseType: "arraybuffer",
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Caller-Id": callerId,
        },
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
  }
);

  // Cancelar processamento de um projeto
router.delete("/:user/:project/process", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;


  axios
    .delete(projectsURL + `${ownerId}/${req.params.project}/process`, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Project-Version": req.headers["x-project-version"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => {
      //  reenviar versão se vier do projects-ms
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

});


/**
 * Get project's processment result
 * @body Empty
 * @returns The required results, sent as [{img_id, img_name, url}]
 */
router.get(
  "/:user/:project/process/url",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .get(projectsURL + `${ownerId}/${req.params.project}/process/url`, {
        httpsAgent,
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Caller-Id": callerId,
        },
      })
      .then((resp) => res.status(200).send(resp.data))
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"));
  }
);


/**
 * Create new user's project
 * @body { "name": String }
 * @returns Created project's data
 */
router.post("/:user", auth.checkToken, function (req, res, next) {
  axios
    .post(projectsURL + `${req.params.user}`, req.body, {
      httpsAgent: httpsAgent,
    })
    .then((resp) => res.status(201).jsonp(resp.data))
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))
});

/**
 * Preview an image
 * @body Empty
 * @returns String indication preview is being processed
 */
router.post(
  "/:user/:project/preview/:img",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    const body = {
      ...req.body,
      runnerUserId: callerId,                         
    };

    axios
      .post(
        projectsURL +
          `${ownerId}/${req.params.project}/preview/${req.params.img}`,
        body,
        { 
          httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined, 
        
        headers: {
          Authorization: req.headers["authorization"],
          "X-Caller-Id": callerId,
        },
      }
      )
      .then((resp) => res.status(201).jsonp(resp.data))
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))
  }
);

/**
 * Add image to project
 * @body Empty
 * @file Image to be added
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/img",
  upload.single("image"),
  auth.checkToken,
  function (req, res, next) {
    if (!req.file) {
      return res
        .status(400)
        .jsonp("No file found or unsupported file type. Allowed types: .png, .jpeg, .jpg, .mp4");
    }

    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    const data = new FormData();
    data.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    axios
      .post(
        projectsURL + `${ownerId}/${req.params.project}/img`,
        data,
        {
          headers: {
            ...data.getHeaders(),                     
            Authorization: req.headers["authorization"], 
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
          httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined, 
          
        }
      )
      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.sendStatus(204);
      })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

  }
);

/**
 * Add tool to project
 * @body { "procedure": String, "params": Object }
 * @returns Post answer structure in case of success
 */
router.post("/:user/:project/tool", auth.checkToken, function (req, res, next) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios.post(
    projectsURL + `${ownerId}/${req.params.project}/tool`,
    req.body,
    {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Project-Version": req.headers["x-project-version"],
        "X-Caller-Id": callerId,
      },
    }
  )

    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.status(201).jsonp(resp.data);
    })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))
});

/**
 * Reorder tools of a project
 * @body [{ "position": Number, "procedure": String, "params": Object }] (Position is a unique number between 0 and req.body.length - 1)
 * @returns Post answer structure in case of success
 */
router.post(
  "/:user/:project/reorder",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .post(
        projectsURL + `${ownerId}/${req.params.project}/reorder`,
        req.body,
        { httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined,
          headers: {
            Authorization: req.headers["authorization"],
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
         }
      )

      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.status(201).jsonp(resp.data);
      })
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))
  }
);

/**
 * Generate request to process a project
 * @body Empty
 * @returns String indicating process request has been created
 */
router.post(
  "/:user/:project/process",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    const body = {
      ...req.body,
      runnerUserId: callerId,                         
    };

    axios
      .post(
        projectsURL + `${ownerId}/${req.params.project}/process`,
        body,
        { httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined,

          headers: {
            Authorization: req.headers["authorization"],
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
         }
      )

      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.status(201).jsonp(resp.data);
      })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

  }
);

/**
 * Update a specific project
 * @body { "name": String }
 * @returns Empty
 */
router.put("/:user/:project", auth.checkToken, function (req, res, next) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .put(projectsURL + `${ownerId}/${req.params.project}`, req.body, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined, 
      headers: {
        Authorization: req.headers["authorization"],
        "X-Project-Version": req.headers["x-project-version"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

});

/**
 * Update a tool from a project
 * @body { "params" : Object }
 * @returns Empty
 */
router.put(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .put(
        projectsURL +
          `${ownerId}/${req.params.project}/tool/${req.params.tool}`,
        req.body,
        { httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined,
          headers: {
            Authorization: req.headers["authorization"],
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
         }
      )

      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.sendStatus(204);
      })
      .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))
  }
);

/**
 * Delete a user's project
 * @body Empty
 * @returns Empty
 */
/**
 * Delete a user's project
 * @body Empty
 * @returns Empty
 */
router.delete("/:user/:project", auth.checkToken, function (req, res, next) {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .delete(projectsURL + `${ownerId}/${req.params.project}`, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Project-Version": req.headers["x-project-version"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

});

/**
 * Remove an image from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/img/:img",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .delete(
        projectsURL +
          `${ownerId}/${req.params.project}/img/${req.params.img}`,
        { httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined,
          headers: {
            Authorization: req.headers["authorization"],
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
         }
      )

      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.sendStatus(204);
      })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

  }
);

/**
 * Remove a tool from a user's project
 * @body Empty
 * @returns Empty
 */
router.delete(
  "/:user/:project/tool/:tool",
  auth.checkToken,
  function (req, res, next) {
    const ownerId = req.query.owner || req.params.user;
    const callerId = req.authUserId || req.params.user;

    axios
      .delete(
        projectsURL +
          `${ownerId}/${req.params.project}/tool/${req.params.tool}`,
        { httpsAgent: httpsAgent,
          params: req.query.share ? { share: req.query.share } : undefined,
          headers: {
            Authorization: req.headers["authorization"],
            "X-Project-Version": req.headers["x-project-version"],
            "X-Caller-Id": callerId,
          },
         }
      )

      .then((resp) => {
        if (resp.headers?.["x-project-version"]) {
          res.set("X-Project-Version", resp.headers["x-project-version"]);
        }
        return res.sendStatus(204);
      })
    .catch((err) => forwardAxiosError(res, err, "mensagem fallback"))

  }
);

// limpar tools + resultados + previews
router.post("/:user/:project/clear", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .post(
      projectsURL + `${ownerId}/${req.params.project}/clear`,
      {},
      {
        httpsAgent,
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Project-Version": req.headers["x-project-version"],
          "X-Caller-Id": callerId,
        },
      },
    )
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "Error clearing project"));
});

// ================== AI ASSISTANT ==================

// sugestões do assistente de IA para um projeto
router.post("/:user/:project/assistant/suggest", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .post(
      projectsURL + `${ownerId}/${req.params.project}/assistant/suggest`,
      req.body,
      {
        httpsAgent,
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Project-Version": req.headers["x-project-version"],
          "X-Caller-Id": callerId,
        },
      },
    )
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.status(200).jsonp(resp.data);
    })
    .catch((err) => forwardAxiosError(res, err, "Error generating assistant suggestions"));
});

// ================== FIM AI ASSISTANT ==================

// ================== PRESENCE (ACTIVE EDITORS) ==================

// heartbeat: manter editor ativo
router.post("/:user/:project/presence", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .post(
      projectsURL + `${ownerId}/${req.params.project}/presence`,
      {},
      {
        httpsAgent,
        params: req.query.share ? { share: req.query.share } : undefined,
        headers: {
          Authorization: req.headers["authorization"],
          "X-Caller-Id": callerId,
        },
      },
    )
    .then((resp) => res.status(204).send())
    .catch((err) => forwardAxiosError(res, err, "Error updating presence"));
});

// libertar slot
router.delete("/:user/:project/presence", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .delete(projectsURL + `${ownerId}/${req.params.project}/presence`, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Caller-Id": callerId,
      },
    })
    .then(() => res.sendStatus(204))
    .catch((err) => forwardAxiosError(res, err, "Error releasing presence"));
});

router.post("/:user/:project/dirty", auth.checkToken, (req, res) => {
  const ownerId = req.query.owner || req.params.user;
  const callerId = req.authUserId || req.params.user;

  axios
    .post(projectsURL + `${ownerId}/${req.params.project}/dirty`, req.body, {
      httpsAgent,
      params: req.query.share ? { share: req.query.share } : undefined,
      headers: {
        Authorization: req.headers["authorization"],
        "X-Project-Version": req.headers["x-project-version"],
        "X-Caller-Id": callerId,
      },
    })
    .then((resp) => {
      if (resp.headers?.["x-project-version"]) {
        res.set("X-Project-Version", resp.headers["x-project-version"]);
      }
      return res.sendStatus(204);
    })
    .catch((err) => forwardAxiosError(res, err, "Error setting dirty flag"));
});


// ================== END PRESENCE ==================

module.exports = router;
