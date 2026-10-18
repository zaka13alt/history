import { timingSafeEqual, createHash } from "node:crypto";

const PASSWORD = process.env.ITCODE_PASSWORD || "zakazakazakazakkzakaa";
const MAX_BODY_BYTES = 4096;

const digest = (value) => createHash("sha256").update(value).digest();

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseCredentials(raw, contentType) {
  if (contentType.includes("application/json")) {
    const data = JSON.parse(raw);
    return { username: String(data.username ?? ""), password: String(data.password ?? "") };
  }
  const params = new URLSearchParams(raw);
  return { username: params.get("username") ?? "", password: params.get("password") ?? "" };
}

// Returns true when the request was handled.
export async function handlePasswordVerify(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname !== "/password/verify") return false;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    send(res, 405, { ok: false, error: "Method not allowed" });
    return true;
  }

  let credentials;
  try {
    credentials = parseCredentials(await readBody(req), req.headers["content-type"] || "");
  } catch {
    send(res, 400, { ok: false, error: "Bad request" });
    return true;
  }

  const ok = timingSafeEqual(digest(credentials.password), digest(PASSWORD));
  send(res, ok ? 200 : 401, { ok });
  return true;
}
