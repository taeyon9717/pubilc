/*
 * GLaDOS 自动签到 - Loon
 * 每日 06:00（设备本地时区）执行。
 * 使用指定签到 API 正则捕获请求中的 Cookie。
 */
const STORE_KEY = "glados_loon_session_v1";
const CHECKIN_URL = "https://glados.cloud/api/user/checkin";

function notify(title, subtitle, body) {
  if (typeof $notification !== "undefined") $notification.post(title, subtitle || "", body || "");
}
function readSession() {
  try {
    const raw = $persistentStore.read(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function captureSession() {
  const req = typeof $request !== "undefined" ? $request : null;
  if (!req || !req.url) { $done({}); return; }
  const headers = req.headers || {};
  const getHeader = (name) => {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : "";
  };
  const cookie = getHeader("Cookie");
  const url = String(req.url);

  // 按用户提供的正则，仅从签到 API 请求中提取 Cookie。
  if (cookie && /^https?:\\/\\/glados\\.[a-z]+\\/api\\/user\\/checkin/i.test(url)) {
    const session = {
      cookie: cookie,
      userAgent: getHeader("User-Agent") || "Mozilla/5.0",
      extraData: getHeader("Extra-Data"),
      authorization: getHeader("Authorization"),
      referer: getHeader("Referer") || "https://glados.cloud/console/checkin",
      capturedAt: new Date().toISOString()
    };
    $persistentStore.write(JSON.stringify(session), STORE_KEY);
    notify("GLaDOS Cookie 已获取", "签到请求中的 Cookie 已保存", "可以进行自动签到。");
  }
  $done({});
}
function runCheckin() {
  const session = readSession();
  if (!session || !session.cookie) {
    notify("GLaDOS 自动签到", "尚未获取登录状态", "请先打开 GLaDOS 签到页面，确保签到 API 请求经过 Loon。");
    $done();
    return;
  }
  const headers = {
    "Cookie": session.cookie,
    "User-Agent": session.userAgent || "Mozilla/5.0",
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://glados.cloud",
    "Referer": session.referer || "https://glados.cloud/console/checkin"
  };
  if (session.extraData) headers["Extra-Data"] = session.extraData;
  if (session.authorization) headers["Authorization"] = session.authorization;
  $httpClient.post({
    url: CHECKIN_URL,
    headers: headers,
    body: JSON.stringify({ token: "glados.cloud" })
  }, (error, response, data) => {
    if (error || !response) {
      notify("GLaDOS 自动签到失败", "网络请求异常", String(error || "未收到服务器响应"));
      $done();
      return;
    }
    let result;
    try { result = JSON.parse(data || "{}"); }
    catch (e) {
      notify("GLaDOS 自动签到失败", "响应解析失败", String(data || "服务器返回空内容").slice(0, 180));
      $done();
      return;
    }
    const message = String(result.message || result.msg || result.error || "");
    const status = Number(response.status || response.statusCode || 0);
    const already = /已经签到|今日已签到|已签到|already.?check.?in|already.?checked/i.test(message);
    const success = status >= 200 && status < 300 &&
      (result.code === 0 || result.code === "0" || result.success === true || /签到成功|check.?in.?success/i.test(message));
    if (already) {
      notify("GLaDOS 自动签到", "今日已签到", message || "无需重复签到");
    } else if (success) {
      let balance = "";
      if (Array.isArray(result.list) && result.list[0] && result.list[0].balance !== undefined)
        balance = "当前余额：" + result.list[0].balance;
      else if (result.data && result.data.balance !== undefined)
        balance = "当前余额：" + result.data.balance;
      notify("GLaDOS 自动签到成功", message || "签到完成", balance);
    } else {
      notify("GLaDOS 自动签到失败", "服务器返回异常", message || ("HTTP " + status + "；请检查 Cookie 是否过期"));
    }
    $done();
  });
}
if (typeof $request !== "undefined") captureSession();
else runCheckin();
