/*
 * GLaDOS 自动签到 - Loon
 * 独立实现：本地捕获 Cookie，每日 06:00 签到。
 * 不包含积分兑换、第三方上报或远程代码加载。
 * Cookie 仅保存在 Loon 本地持久化存储中。
 */

var STORE_KEY = "glados_loon_session_v2";

function notify(title, subtitle, body) {
  if (typeof $notification !== "undefined") {
    $notification.post(title, subtitle || "", body || "");
  }
}

function parseJson(value) {
  try { return JSON.parse(value || "{}"); } catch (e) { return {}; }
}

function getHeader(headers, name) {
  headers = headers || {};
  var target = String(name).toLowerCase();
  for (var key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key) &&
        String(key).toLowerCase() === target) return headers[key];
  }
  return "";
}

function getAllowedHost(url) {
  var match = String(url || "").match(/^https?:\/\/(glados\.[a-z]+)(?=\/|:|$)/i);
  return match ? match[1].toLowerCase() : "";
}

function readSession() {
  try {
    var raw = $persistentStore.read(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function captureRequest() {
  var req = typeof $request !== "undefined" ? $request : null;
  if (!req || !req.url) {
    $done({});
    return;
  }

  var url = String(req.url);
  var host = getAllowedHost(url);
  if (!host || !/^https?:\/\/glados\.[a-z]+\/api\/user\/checkin(?:[?#]|$)/i.test(url)) {
    $done({});
    return;
  }

  var headers = req.headers || {};
  var cookie = getHeader(headers, "Cookie");
  if (!cookie) {
    notify("GLaDOS Cookie 获取失败", "请求中没有 Cookie", host);
    $done({});
    return;
  }

  var session = {
    host: host,
    cookie: String(cookie),
    userAgent: String(getHeader(headers, "User-Agent") || "Mozilla/5.0"),
    extraData: String(getHeader(headers, "Extra-Data") || ""),
    authorization: String(getHeader(headers, "Authorization") || ""),
    referer: String(getHeader(headers, "Referer") || ("https://" + host + "/console/checkin")),
    capturedAt: new Date().toISOString()
  };

  if (!$persistentStore.write(JSON.stringify(session), STORE_KEY)) {
    notify("GLaDOS Cookie 保存失败", "Loon 本地存储写入失败", host);
  } else {
    notify("GLaDOS Cookie 已更新", "登录请求凭据已保存在本地", host);
  }
  $done({});
}

function runCheckin() {
  var session = readSession();
  if (!session || !session.cookie || !session.host || !/^glados\.[a-z]+$/i.test(session.host)) {
    notify("GLaDOS 自动签到", "尚未获取有效登录状态", "请先登录并触发一次 GLaDOS 签到请求。");
    $done();
    return;
  }

  var headers = {
    "Cookie": session.cookie,
    "User-Agent": session.userAgent || "Mozilla/5.0",
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://" + session.host,
    "Referer": session.referer || ("https://" + session.host + "/console/checkin")
  };
  if (session.extraData) headers["Extra-Data"] = session.extraData;
  if (session.authorization) headers["Authorization"] = session.authorization;

  $httpClient.post({
    url: "https://" + session.host + "/api/user/checkin",
    headers: headers,
    body: JSON.stringify({ token: session.host })
  }, function (error, response, data) {
    if (error || !response) {
      notify("GLaDOS 签到失败", "网络请求异常", String(error || "未收到服务器响应"));
      $done();
      return;
    }

    var result = parseJson(data);
    var message = String(result.message || result.msg || result.error || "");
    var statusCode = Number(response.statusCode || response.status || 0);
    var already = /已经签到|今日已签到|已签到|already.?check.?in|already.?checked|repeat/i.test(message);
    var success = statusCode >= 200 && statusCode < 300 &&
      (result.code === 0 || result.code === "0" || result.success === true ||
       /签到成功|check.?in.?success|got\s+\d+\s+points?/i.test(message));

    if (already) {
      notify("GLaDOS 自动签到", "今日已签到", message || "无需重复签到");
    } else if (success) {
      notify("GLaDOS 自动签到成功", message || "签到完成", session.host);
    } else {
      notify("GLaDOS 自动签到失败", "服务器返回异常",
        message || ("HTTP " + statusCode + "；请检查登录状态及设备校验"));
    }
    $done();
  });
}

if (typeof $request !== "undefined") {
  captureRequest();
} else {
  runCheckin();
}
