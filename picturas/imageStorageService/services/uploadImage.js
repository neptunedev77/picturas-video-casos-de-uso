const s3 = require("./s3Client");
const createBucket = require("./createBucket");
const { v4: uuidv4 } = require("uuid");

async function uploadImage(userId, projectId, file, stage) {
  const bucketName = `user-${userId}`;
  await createBucket(bucketName);

  let ext = "jpg";
  if (file.originalname && file.originalname.includes(".")) {
    ext = file.originalname.split(".").pop().toLowerCase();
  } else if (file.mimetype && file.mimetype.includes("/")) {
    ext = file.mimetype.split("/")[1].toLowerCase();
  }
  if (ext === "jfif") ext = "jpg";

  let contentType = file.mimetype;
  if (!contentType || contentType === "application/octet-stream") {
    if (ext === "png") contentType = "image/png";
    else if (ext === "webp") contentType = "image/webp";
    else contentType = "image/jpeg";
  }

  const imageKey = `${projectId}/${stage}/${uuidv4()}.${ext}`;
  const params = {
    Bucket: bucketName,
    Key: imageKey,
    Body: file.buffer,
    ContentType: contentType,
  };

  try {
    const data = await s3.upload(params).promise();
    return { imageKey, location: data.Location };
  } catch (error) {
    console.error("Erro ao enviar imagem:", error.message);
    throw error;
  }
}

module.exports = uploadImage;
