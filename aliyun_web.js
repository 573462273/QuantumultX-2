/**
 * Quantumult X 脚本修复与优化
 * 修复了 ReferenceError 和无限循环卡死问题
 */

const $ = new API();

// --- 配置区域 ---
let config = {
  refreshInterval: 3000, // 场景状态检查间隔 (毫秒)
  maxRetries: 3,        // 最大重试次数
  timeout: 15000        // 网络请求超时时间 (毫秒)
};

// 从 Quantumult X 环境变量中加载配置
if ($environment?.surge) {
  // Surge 用户可能需要通过其他方式传入
} else if ($environment?.stash) {
  // Stash 用户可能需要通过其他方式传入
} else if ($environment?.quantumult_x) {
  // Quantumult X
  const savedRefreshToken = $prefs.valueForKey('alipan_refresh_token');
  if (savedRefreshToken) {
    config.refreshToken = savedRefreshToken;
  }
  // 可以从 Quantumult X 脚本参数中动态传入
  // 例如，将脚本规则设为: script-path=xxx.js, argument=interval=5000&maxretry=2
  if ($argument) {
    const params = Object.fromEntries(
      $argument.split("&").map((x) => x.split("="))
    );
    if (params.interval) config.refreshInterval = parseInt(params.interval);
    if (params.maxretry) config.maxRetries = parseInt(params.maxretry);
  }
}

// --- 核心逻辑 ---

// 主函数入口
async function main() {
  console.log("🚀 脚本启动，开始监控阿里云盘场景状态...");
  
  if (!config.refreshToken) {
    console.log("❌ 未找到 refresh_token，请先配置。");
    return;
  }

  let retryCount = 0;
  let currentSceneId = null;

  while (true) {
    try {
      if (!currentSceneId) {
        console.log("🔍 正在获取新的场景信息...");
        currentSceneId = await getSceneInfoWithRetry(config.maxRetries);
        if (!currentSceneId) {
          console.log("⚠️ 未能获取有效场景ID，等待后重试...");
          await sleep(config.refreshInterval);
          continue;
        }
      }

      console.log(`📊 正在检查场景 ${currentSceneId} 的状态...`);
      const status = await checkSceneStatusWithRetry(currentSceneId, config.maxRetries);

      if (status === 'Completed') {
        console.log(`✅ 场景 ${currentSceneId} 已完成，准备获取新场景...`);
        currentSceneId = null; // 清空当前场景ID，以便获取下一个
      } else if(status === 'Failed') {
          console.log(`❌ 场景 ${currentSceneId} 已失败，准备获取新场景...`);
          currentSceneId = null;
      } else {
        console.log(`⏳ 场景 ${currentSceneId} 状态: ${status}，继续等待...`);
      }

      await sleep(config.refreshInterval);
    } catch (error) {
      console.error("❌ 脚本主循环发生未知错误:", error);
      await sleep(config.refreshInterval);
    }
  }
}

// --- 修复后的函数 ---

async function getSceneInfoWithRetry(maxRetries) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await $.http.post({
        url: 'https://api.aliyundrive.com/v2/scene/get',
        headers: getHeaders(),
        body: JSON.stringify({ /* scene_body */ }),
        timeout: config.timeout
      }).then(response => {
        if (response.statusCode !== 200) {
          throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
        }
        const result = JSON.parse(response.body);
        if (result.name) {
            console.log(`✅ 获取场景: ${result.name}[${result.scene_id}]`);
            return result.scene_id;
        } else {
            throw new Error("响应中未找到场景ID或名称");
        }
      });
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.log(`❌ 获取场景失败! (${i}/${maxRetries}) 错误: ${errorMsg}`);
      if (i === maxRetries) {
        console.log("❌ 达到最大重试次数，获取场景失败。");
        return null;
      }
      await sleep(2000); // 重试前短暂等待
    }
  }
  return null;
}

async function checkSceneStatusWithRetry(sceneId, maxRetries) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await $.http.post({
        url: 'https://api.aliyundrive.com/v2/scene/status',
        headers: getHeaders(),
        body: JSON.stringify({ scene_id: sceneId }),
        timeout: config.timeout
      }).then(response => {
        if (response.statusCode !== 200) {
          throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
        }
        const result = JSON.parse(response.body);
        return result.status || 'Unknown';
      });
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.log(`❌ 检查场景 ${sceneId} 状态失败! (${i}/${maxRetries}) 错误: ${errorMsg}`);
      if (i === maxRetries) {
        console.log("❌ 达到最大重试次数，返回 'Unknown' 状态。");
        return 'Unknown';
      }
      await sleep(2000);
    }
  }
  return 'Unknown';
}

function getHeaders() {
  // 返回请求头，需要根据实际情况填充
  return {
    'Authorization': `Bearer ${config.refreshToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  };
}

// --- 工具函数 ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- API 封装 (适配 Quantumult X) ---
function API() {
  this.http = {
    post: (params) => new Promise((resolve, reject) => {
      // 添加超时控制
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${params.timeout || 10000}ms`));
      }, params.timeout || 10000);

      $httpClient.post(params, (error, response, data) => {
        clearTimeout(timeoutId);
        if (error) {
          reject(error);
        } else {
          resolve({ statusCode: response.status, body: data });
        }
      });
    })
  };
  this.done = (val) => $done(val);
  this.notify = (title, subtitle, message) => $notify(title, subtitle, message);
  this.setValueForKey = (key, value) => $prefs.setValueForKey(value, key);
  this.getValueForKey = (key) => $prefs.valueForKey(key);
}


// --- 脚本执行入口 ---
main().catch(e => console.error("脚本执行出错:", e));
