/*
 * 拾光 · GitHub Pages 演示数据层
 * 复用现有前端的接口契约，每位访问者在自己的浏览器内操作独立示例数据。
 * FastAPI + SQLite 版本继续使用真实后端，不加载本文件。
 */
(function () {
  'use strict';

  var KEY = 'shiguang.pages.demo.v1';
  var SHANGHAI_OFFSET_MIN = 8 * 60;
  var lessonsPromise = null;
  var originalFetch = window.fetch ? window.fetch.bind(window) : null;
  // Only AI uses the real server; ordinary demo records remain browser-local.
  window.TrackerRemoteFetch = originalFetch;

  function todayShanghai() {
    return new Date(Date.now() + SHANGHAI_OFFSET_MIN * 60000).toISOString().slice(0, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function seed() {
    var start = addDays(todayShanghai(), -9);
    var offsets = [0, 1, 3, 4, 5, 6, 7, 8];
    var topics = ['明确 AI 与开发者的职责', '结构化提示词', '精确描述需求', '开发环境与可复现运行',
      '检查 AI 输出', '模块化拆分', 'API 接口设计', '全栈集成与测试'];
    var records = offsets.map(function (offset, i) {
      return { id: i + 1, plan_id: 1, study_date: addDays(start, offset), topic: topics[i],
        minutes: [40, 55, 35, 65, 45, 60, 50, 45][i],
        takeaway: '演示示例：把任务拆成可以验证的小步骤，并检查输入边界和运行结果。',
        next_step: '演示示例：补充一次自己的实践与收获。', shared: i < 6, created_at: nowIso() };
    });
    return { plans: [{ id: 1, name: '四周生成式开发 · 演示', start_date: start,
      days: 28, target_minutes: 45, created_at: nowIso() }], records: records, nextPlanId: 2, nextRecordId: 9 };
  }

  function load() {
    var raw = localStorage.getItem(KEY);
    var d = raw ? JSON.parse(raw) : seed();
    if (!d || !Array.isArray(d.plans) || !Array.isArray(d.records)
        || !Number.isInteger(d.nextPlanId) || !Number.isInteger(d.nextRecordId)) {
      throw new Error('invalid demo storage');
    }
    if (!raw) persist(d);
    return d;
  }

  function persist(d) {
    localStorage.setItem(KEY, JSON.stringify(d));
  }

  function resp(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function empty(status) {
    return new Response(null, { status: status });
  }

  function fail(status, detail) {
    return resp({ detail: detail }, status);
  }

  function parseDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    var p = text.split('-').map(Number);
    if (p[0] < 1 || p[0] > 9999) return null;
    var d = new Date(0);
    d.setUTCFullYear(p[0], p[1] - 1, p[2]);
    if (d.getUTCFullYear() !== p[0] || d.getUTCMonth() !== p[1] - 1 || d.getUTCDate() !== p[2]) return null;
    return d;
  }

  function addDays(text, days) {
    var d = parseDate(text);
    if (!d) return null;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function sortRecords(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.study_date !== b.study_date) return a.study_date < b.study_date ? 1 : -1;
      return b.id - a.id;
    });
  }

  function planView(d, plan) {
    var done = d.records.filter(function (r) { return r.plan_id === plan.id; }).length;
    return Object.assign({}, plan, {
      completed_days: done,
      progress: Math.round(done / plan.days * 100)
    });
  }

  function recordView(planNameById, r) {
    return Object.assign({}, r, { plan_name: planNameById[r.plan_id] || '', shared: !!r.shared });
  }

  function validatePlan(data) {
    if (!data || typeof data !== 'object') return '请求数据不完整';
    if (Object.keys(data).some(function (key) {
      return ['name', 'start_date', 'days', 'target_minutes'].indexOf(key) < 0;
    })) return '存在未定义的计划字段';
    var name = typeof data.name === 'string' ? data.name.trim() : '';
    if (name.length < 1 || name.length > 60) return '计划名称长度需为 1–60 个字符';
    if (!parseDate(data.start_date)) return '开始日期格式不正确';
    if (!Number.isInteger(data.days) || data.days < 1 || data.days > 90) return '计划天数需为 1–90 的整数';
    if (!Number.isInteger(data.target_minutes) || data.target_minutes < 5 || data.target_minutes > 480) {
      return '每日目标需为 5–480 的整数';
    }
    if (addDays(data.start_date, data.days - 1) > '9999-12-31'
        || addDays(data.start_date, data.days - 1).length !== 10) return '计划结束日期超出支持范围';
    return null;
  }

  function validateRecord(d, data) {
    if (!data || typeof data !== 'object') return { error: '请求数据不完整' };
    if (Object.keys(data).some(function (key) {
      return ['plan_id', 'study_date', 'topic', 'minutes', 'takeaway', 'next_step', 'shared'].indexOf(key) < 0;
    })) return { error: '存在未定义的记录字段' };
    if (!Number.isInteger(data.plan_id) || data.plan_id < 1) return { error: '所属计划不正确' };
    var plan = d.plans.find(function (p) { return p.id === data.plan_id; });
    if (!plan) return { status: 404, error: '学习计划不存在' };
    if (!parseDate(data.study_date)) return { error: '学习日期格式不正确' };
    var today = todayShanghai();
    if (data.study_date > today) return { error: '学习日期不能晚于北京时间今天' };
    var end = addDays(plan.start_date, plan.days - 1);
    if (data.study_date < plan.start_date || data.study_date > end) {
      return { error: '学习日期必须在计划的日期范围内' };
    }
    var topic = typeof data.topic === 'string' ? data.topic.trim() : '';
    var takeaway = typeof data.takeaway === 'string' ? data.takeaway.trim() : '';
    var nextStep = typeof data.next_step === 'string' ? data.next_step.trim() : '';
    if (topic.length < 1 || topic.length > 120) return { error: '学习主题长度需为 1–120 个字符' };
    if (!Number.isInteger(data.minutes) || data.minutes < 1 || data.minutes > 720) {
      return { error: '学习时长需为 1–720 的整数' };
    }
    if (takeaway.length < 1 || takeaway.length > 1500) return { error: '学习收获长度需为 1–1500 个字符' };
    if (nextStep.length > 1000) return { error: '下一步长度不能超过 1000 个字符' };
    if (data.shared !== undefined && typeof data.shared !== 'boolean') return { error: '分享状态不正确' };
    return {
      value: {
        plan_id: data.plan_id,
        study_date: data.study_date,
        topic: topic,
        minutes: data.minutes,
        takeaway: takeaway,
        next_step: nextStep,
        shared: data.shared === true
      }
    };
  }

  function summarize(records) {
    var today = todayShanghai();
    var dates = Array.from(new Set(records.map(function (r) { return r.study_date; }))).sort();
    var longest = 0, current = 0, previous = null;
    dates.forEach(function (day) {
      current = previous && addDays(previous, 1) === day ? current + 1 : 1;
      longest = Math.max(longest, current);
      previous = day;
    });
    var streak = 0;
    var set = new Set(dates);
    var yesterday = addDays(today, -1);
    if (dates.length && dates[dates.length - 1] >= yesterday) {
      var cursor = dates[dates.length - 1];
      while (set.has(cursor)) {
        streak += 1;
        cursor = addDays(cursor, -1);
      }
    }
    var byDay = {};
    records.forEach(function (r) { byDay[r.study_date] = (byDay[r.study_date] || 0) + r.minutes; });
    var daily = Object.keys(byDay).sort().map(function (day) { return { date: day, minutes: byDay[day] }; });
    return {
      days: dates.length,
      minutes: records.reduce(function (sum, r) { return sum + r.minutes; }, 0),
      streak: streak,
      longest_streak: longest,
      shared_days: new Set(records.filter(function (r) { return r.shared; }).map(function (r) { return r.study_date; })).size,
      daily: daily,
      recent: sortRecords(records).slice(0, 5)
    };
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text.replace(/^\s+/, ''))) text = "'" + text;
    if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function buildCsv(d, planId) {
    var planNameById = {};
    d.plans.forEach(function (p) { planNameById[p.id] = p.name; });
    var rows = sortRecords(d.records).filter(function (r) {
      return !planId || r.plan_id === planId;
    });
    var lines = [['计划', '日期', '主题', '学习分钟', '收获', '下一步', '自述已上传分享'].map(csvCell).join(',')];
    rows.forEach(function (r) {
      lines.push([
        planNameById[r.plan_id] || '', r.study_date, r.topic, r.minutes,
        r.takeaway, r.next_step, r.shared ? '是' : '否'
      ].map(csvCell).join(','));
    });
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  function saveText(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  function exportCsv(href) {
    var query = '';
    try { query = new URL(href, location.href).search; } catch (e) { query = ''; }
    var planId = Number(new URLSearchParams(query).get('plan_id') || 0);
    var d = load();
    saveText('learning-records.csv', buildCsv(d, planId), 'text/csv');
    return true;
  }

  window.offlineExportCsv = exportCsv;

  document.addEventListener('click', function (event) {
    var target = event.target;
    var anchor = target && target.closest ? target.closest('a[href^="./api/export.csv"]') : null;
    if (anchor) {
      event.preventDefault();
      exportCsv(anchor.getAttribute('href'));
    }
  }, true);

  function getLessons() {
    if (!lessonsPromise) {
      lessonsPromise = (originalFetch ? originalFetch(new URL('static/lessons.json', document.baseURI).href) : Promise.reject(new Error('fetch unavailable')))
        .then(function (r) { return r.json(); });
    }
    return lessonsPromise;
  }

  async function handle(path, params, init) {
    var method = ((init && init.method) || 'GET').toUpperCase();
    var data = null;
    if (init && init.body) {
      try { data = JSON.parse(init.body); } catch (e) { return fail(422, '请求格式错误'); }
    }
    var d = load();

    if (path === '/api/health' && method === 'GET') {
      return resp({ status: 'ok', today: todayShanghai(), demo: true });
    }

    if (path === '/api/lessons' && method === 'GET') {
      try { return resp(await getLessons()); } catch (e) { return fail(500, '知识点加载失败'); }
    }

    if (path === '/api/plans' && method === 'GET') {
      var plans = d.plans.slice().sort(function (a, b) { return b.id - a.id; })
        .map(function (p) { return planView(d, p); });
      return resp(plans);
    }

    if (path === '/api/plans' && method === 'POST') {
      var planError = validatePlan(data);
      if (planError) return fail(422, planError);
      var plan = {
        id: d.nextPlanId++,
        name: data.name.trim(),
        start_date: data.start_date,
        days: data.days,
        target_minutes: data.target_minutes,
        created_at: nowIso()
      };
      d.plans.push(plan);
      persist(d);
      return resp(plan, 201);
    }

    var planMatch = path.match(/^\/api\/plans\/(\d+)$/);
    if (planMatch) {
      var planId = Number(planMatch[1]);
      var existing = d.plans.find(function (p) { return p.id === planId; });
      if (!existing) return fail(404, '学习计划不存在');

      if (method === 'PUT') {
        var editError = validatePlan(data);
        if (editError) return fail(422, editError);
        var end = addDays(data.start_date, data.days - 1);
        var outside = d.records.some(function (r) {
          return r.plan_id === planId && (r.study_date < data.start_date || r.study_date > end);
        });
        if (outside) return fail(409, '新的计划日期范围不能排除已有打卡记录');
        existing.name = data.name.trim();
        existing.start_date = data.start_date;
        existing.days = data.days;
        existing.target_minutes = data.target_minutes;
        persist(d);
        return resp(existing);
      }

      if (method === 'DELETE') {
        if (d.records.some(function (r) { return r.plan_id === planId; })) {
          return fail(409, '计划内仍有打卡记录，请先处理记录后再删除计划');
        }
        d.plans = d.plans.filter(function (p) { return p.id !== planId; });
        persist(d);
        return empty(204);
      }
    }

    if (path === '/api/records' && method === 'GET') {
      var filterPlan = params.get('plan_id');
      if (filterPlan && !d.plans.some(function (p) { return p.id === Number(filterPlan); })) {
        return fail(404, '学习计划不存在');
      }
      var names = {};
      d.plans.forEach(function (p) { names[p.id] = p.name; });
      var rows = sortRecords(d.records).filter(function (r) {
        return !filterPlan || r.plan_id === Number(filterPlan);
      }).map(function (r) { return recordView(names, r); });
      return resp(rows);
    }

    if (path === '/api/records' && method === 'POST') {
      var checked = validateRecord(d, data);
      if (checked.error) return fail(checked.status || 422, checked.error);
      var duplicate = d.records.some(function (r) {
        return r.plan_id === checked.value.plan_id && r.study_date === checked.value.study_date;
      });
      if (duplicate) return fail(409, '这个计划当天已经打卡，请编辑原记录');
      var record = Object.assign({ id: d.nextRecordId++, created_at: nowIso() }, checked.value);
      d.records.push(record);
      persist(d);
      var planNames = {};
      d.plans.forEach(function (p) { planNames[p.id] = p.name; });
      return resp(recordView(planNames, record), 201);
    }

    var recordMatch = path.match(/^\/api\/records\/(\d+)$/);
    if (recordMatch) {
      var recordId = Number(recordMatch[1]);
      var target = d.records.find(function (r) { return r.id === recordId; });
      if (!target) return fail(404, '打卡记录不存在');

      if (method === 'PUT') {
        var editChecked = validateRecord(d, data);
        if (editChecked.error) return fail(editChecked.status || 422, editChecked.error);
        var conflict = d.records.some(function (r) {
          return r.id !== recordId && r.plan_id === editChecked.value.plan_id && r.study_date === editChecked.value.study_date;
        });
        if (conflict) return fail(409, '这个计划当天已经有另一条打卡');
        Object.assign(target, editChecked.value);
        persist(d);
        var editNames = {};
        d.plans.forEach(function (p) { editNames[p.id] = p.name; });
        return resp(recordView(editNames, target));
      }

      if (method === 'DELETE') {
        d.records = d.records.filter(function (r) { return r.id !== recordId; });
        persist(d);
        return empty(204);
      }
    }

    if (path === '/api/stats' && method === 'GET') {
      var statPlan = params.get('plan_id');
      if (statPlan && !d.plans.some(function (p) { return p.id === Number(statPlan); })) {
        return fail(404, '学习计划不存在');
      }
      var scoped = d.records.filter(function (r) { return !statPlan || r.plan_id === Number(statPlan); });
      return resp(summarize(scoped));
    }

    if (path === '/api/export.csv' && method === 'GET') {
      var exportPlan = Number(params.get('plan_id') || 0);
      if (exportPlan && !d.plans.some(function (p) { return p.id === exportPlan; })) {
        return fail(404, '学习计划不存在');
      }
      return new Response(buildCsv(d, exportPlan), {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      });
    }

    return fail(404, '接口不存在');
  }

  window.fetch = async function (input, init) {
    var raw = typeof input === 'string' ? input : (input && input.url);
    var url;
    try { url = new URL(raw, location.href); } catch (e) { return Promise.reject(e); }
    var basePath = new URL('.', document.baseURI).pathname;
    var apiPrefix = basePath + 'api/';
    if (url.origin === location.origin && url.pathname.indexOf(apiPrefix) === 0) {
      try {
        return await handle('/api/' + url.pathname.slice(apiPrefix.length), url.searchParams, init);
      } catch (e) {
        return fail(503, '浏览器演示数据无法读写。请允许本站存储；数据损坏时可使用顶部“重置示例”。');
      }
    }
    return originalFetch ? originalFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  function bindReset() {
    var button = document.getElementById('reset-demo');
    if (!button) return;
    button.addEventListener('click', function () {
      if (!window.confirm('重置会清除你在此演示站点填写的计划与记录，并恢复示例数据。确定继续吗？')) return;
      try {
        localStorage.removeItem(KEY);
        location.reload();
      } catch (e) {
        window.alert('浏览器不允许读写演示数据，请检查本站存储权限。');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindReset);
  else bindReset();
})();
