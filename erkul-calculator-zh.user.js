// ==UserScript==
// @name         Erkul Games Calculator Simplified Chinese
// @name:zh-CN   Erkul Games 配装计算器简体中文
// @namespace    urn:userscript:latsummer:erkul-calculator-zh
// @version      0.2.2
// @description  Simplified Chinese localization for the Erkul Games Calculator UI, component stats, dialogs, and simulations.
// @description:zh-CN  为 Erkul Games 配装计算器提供简体中文界面、组件参数、弹窗及模拟器翻译，并保留飞船、组件与厂商专名。
// @author       Latsummer
// @copyright    2026, Latsummer
// @match        https://erkul.games/calculator*
// @match        https://www.erkul.games/calculator*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'erkul-calculator-zh-enabled';
  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';

  // 只翻译界面词，不翻译装备、飞船、厂商等专有名称。
  const exact = new Map(Object.entries({
    'Calculator': '配装计算器',
    'Build a ship loadout and see its damage, defense and flight stats.': '配置飞船装备，并查看伤害、防御与飞行数据。',
    'DATA': '数据版本',
    'Cart': '购物车',
    'Search': '搜索',
    'Actions': '操作',
    'Share': '分享',
    'Save to hangar': '保存到机库',
    'Reset loadout': '重置配装',
    'Reset slots': '重置槽位',
    'Collapse cards': '折叠卡片',
    'Collapse all': '全部折叠',
    'Collapse panel': '折叠面板',
    'Collapse': '折叠',
    'Expand': '展开',
    'Reset card order': '重置卡片顺序',
    'Non-stock items to cart': '将非原装物品加入购物车',
    'Where to buy': '购买地点',
    'Component details': '组件详情',
    'Ship details': '飞船详情',
    'Craft component': '制造组件',
    'Power off': '关闭供电',
    'Remove weapon': '移除武器',
    'Remove mount': '移除挂架',
    'Remove rack': '移除发射架',
    'Remove shield': '移除护盾',
    'Remove cooler': '移除冷却器',
    'Remove radar': '移除雷达',
    'Remove power plant': '移除发电机',
    'Remove quantum drive': '移除量子驱动器',
    'Remove jump drive': '移除跃迁驱动器',
    'Equip paint': '装备涂装',
    'Unload missile': '卸下导弹',
    'Swap weapon': '更换武器',
    'Swap radar': '更换雷达',
    'Swap quantum drive': '更换量子驱动器',
    'Swap shield': '更换护盾',
    'Swap': '更换',
    'Cancel': '取消',
    'Equipped': '已装备',
    'No results found': '没有找到结果',
    'Loading catalogue…': '正在加载目录…',
    'Loading catalogue': '正在加载目录',
    'Open navigation': '打开导航',
    'Cookie consent': 'Cookie 设置',
    'Refuse': '拒绝',
    'Accept': '接受',

    'Damage': '伤害',
    'Defense': '防御',
    'Flight': '飞行',
    'Hull': '船体',
    'Description': '说明',
    'Simulations': '模拟',
    'Penetration': '穿透',
    'Deflection': '偏转阈值',
    'Travel time': '量子航行时间',
    'Penetration check': '穿透能力检验',
    'Deflection check': '偏转阈值检验',
    'Your weapon': '你的武器',
    'All weapons': '全部武器',
    'Target shield health': '目标护盾耐久',
    'Target armor health': '目标装甲耐久',
    'Target ship': '目标舰船',
    'hold': '未穿透',
    'pierced': '已穿透',
    '◄ Armor holds': '◄ 装甲挡住',
    'DEFLECTION BOUNDARY': '偏转分界线',
    'You pierce ►': '可穿透 ►',
    'Deflect': '被偏转',
    'Shields health': '护盾耐久',
    'Shield health': '护盾耐久',
    'Armor health': '装甲耐久',
    'Absorb': '吸收率',
    'Defl': '偏转阈值',
    'Type': '尺寸',
    'deflected': '被偏转',
    'pierce': '可穿透',
    '◄ Deflected': '◄ 被偏转',
    'Penetrates ►': '可穿透 ►',
    'threshold crossed': '超过偏转阈值',
    'ABSORBED BY SHIELD': '被护盾吸收',
    'PHYS defl': '实弹偏转阈值',
    'ENERGY defl': '能量偏转阈值',
    'DIST defl': '畸变偏转阈值',
    'Quantum drive': '量子驱动器',
    'Distance': '距离',
    'short': '短程',
    'medium': '中程',
    'long': '远程',
    'Jump distance (Gm)': '跃迁距离（Gm）',
    'Time to arrival': '到达时间',
    'Spool-up': '预热',
    'Quantum travel': '量子航行',
    'Cooldown (next jump)': '冷却（下次跃迁）',
    'Full cycle': '完整周期',
    'Peak speed': '峰值速度',
    'Fuel consumption (est.)': '预计燃料消耗',
    'Power Management': '电力管理',
    'Armament': '武器系统',
    'Ordnance': '投射武器',
    'Quantum drive': '量子驱动器',
    'Quantum Drive': '量子驱动器',
    'Jump drive': '跃迁驱动器',
    'Shields': '护盾',
    'Shield': '护盾',
    'Power plant': '发电机',
    'Coolers': '冷却器',
    'Cooler': '冷却器',
    'Radar': '雷达',
    'Life support': '生命维持系统',
    'Paint': '涂装',
    'Thrusters': '推进器',
    'Weapons': '武器',
    'Weapon': '武器',
    'Turrets': '炮塔',
    'Missiles': '导弹',
    'Missile': '导弹',
    'Bombs': '炸弹',
    'Bomb': '炸弹',
    'Engine': '引擎',

    'Alpha': '单发伤害',
    'Σ Alpha': '总单发伤害',
    'Sustained': '持续秒伤',
    'Sust.': '持续秒伤',
    'Sustained DPS': '持续秒伤',
    'Burst': '爆发秒伤',
    'Burst DPS': '爆发秒伤',
    'DPS': '秒伤',
    'Missile dmg': '导弹伤害',
    'Bomb dmg': '炸弹伤害',
    'EMP dmg': 'EMP 伤害',
    'Source': '来源',
    'Pilot': '驾驶员武器',
    'Manned turret': '有人炮塔',
    'Remote turret': '遥控炮塔',
    'PDS': '点防御系统',
    'PHYS': '实弹',
    'ENERGY': '能量',
    'DISTORTION': '畸变',
    'All': '全部',
    'Cannon': '加农炮',
    'Gatling': '加特林',
    'Repeater': '速射炮',
    'Scattergun': '霰弹炮',
    'NAME': '名称',
    'Name': '名称',
    'ALPHA': '单发',
    'PEN': '穿深',
    'Pen': '穿深',
    'RATE': '射速',
    'Rate': '射速',
    'RANGE': '射程',
    'SPEED': '弹速',
    'Speed': '弹速',
    'SPREAD': '散布',
    'Spread': '散布',
    'POWER': '电力需求',
    'Power': '电力需求',
    'AMMO': '弹药',
    'Ammo': '弹药',
    'HP': '耐久',
    'Hp': '耐久',
    'EM': '电磁',
    'Em': '电磁',
    'DMG TYPE FILTER': '伤害类型筛选',
    'Dmg type filter': '伤害类型筛选',
    'WEAPON TYPE FILTER': '武器类型筛选',
    'Weapon type filter': '武器类型筛选',
    'TYPE FILTER': '类型筛选',
    'Type filter': '类型筛选',
    'GRADE FILTER': '等级筛选',
    'Grade filter': '等级筛选',
    'MIN RANGE': '最小探测距离',
    'Min range': '最小探测距离',
    'MAX RANGE': '最大探测距离',
    'Max range': '最大探测距离',
    'BUFFER': '缓冲距离',
    'Buffer': '缓冲距离',
    'MIN PWR': '最低配电',
    'Min pwr': '最低配电',
    'PWR': '配电上限',
    'Pwr': '配电上限',
    'POOL HP': '护盾容量',
    'Pool hp': '护盾容量',
    'REGEN': '回充速率',
    'Regen': '回充速率',
    'EFFICIENCY': '效率',
    'Efficiency': '效率',
    'CONSUMPTION': '消耗量',
    'Consumption': '消耗量',

    'Dimensions': '尺寸',
    'Mass': '质量',
    'Vital': '致命部位',
    'Secondary': '次要部位',
    'Breakable': '可脱落部位',
    'Subpart': '子部件',
    'Breakdown': '明细',
    'Shield HP': '护盾耐久',
    'Armor HP': '装甲耐久',
    'Regen hp/s': '每秒恢复',
    'Resistance': '抗性',
    'Absorption': '吸收率',
    'Damage reduction': '伤害减免',
    'Self resistance': '自身抗性',
    'Signature': '信号特征',
    'Countermeasures': '对抗措施',
    'Face type': '护盾形态',
    'Bubble': '全向泡泡',
    'Armor': '装甲',
    'Decoy': '热焰弹',
    'Noise': '噪声弹',
    'Phys': '实弹',
    'Energy': '能量',
    'Ballistic': '实弹',
    'Distort': '畸变',
    'Distortion': '畸变',
    'Cooling': '冷却效率',
    'Aim assist': '瞄准辅助',
    'Pitch': '俯仰',
    'Yaw': '偏航',
    'Roll': '滚转',
    'Hydrogen Fuel': '氢燃料',
    'Qt fuel': '量子燃料',
    'Range': '航程',
    'Delay': '延迟',
    'Full boost regen': '加力完全恢复',
    'No paint': '无涂装',
    'Main': '主推进器',
    'Retro': '反推器',
    'Maneuver': '机动推进器',
    'Top': '上方',
    'Bottom': '下方',
    'Left': '左侧',
    'Right': '右侧',
    'Weapon Mount': '武器挂架',
    'Gimbal': '万向节',
    'Loaded': '已装载',
    'Missile Rack': '导弹架',
    'Infrared seeker': '红外制导',
    'Cross-Section seeker': '横截面制导',
    'Fuel consumption': '燃料消耗',
    'Jump timeline': '量子航行时间线',
    'Spool': '预热',
    'Travel': '航行',
    'Cooldown': '冷却',
    'Civilian': '民用',
    'Military': '军用',
    'Stealth': '隐形',
    'Industrial': '工业',
    'Competition': '竞赛',
    'No overheat': '不会过热',
    'PILOT': '驾驶员',
    'SCM MODE': 'SCM 模式',
    'NAV MODE': 'NAV 模式',
    'Auto': '自动',
    'LOCK': '锁定炮',
    'GIMBAL / AUTO / PRE': '万向 / 自动 / 预瞄'
  }));

  const patterns = [
    // 厂商和类型可能放在同一个文本节点中，只翻译分隔符后的类型。
    [/^(.*[·•]\s*)(Civilian|Military|Stealth|Industrial|Competition)$/i,
      (_, prefix, type) => prefix + ({ civilian: '民用', military: '军用', stealth: '隐形', industrial: '工业', competition: '竞赛' })[type.toLowerCase()]],
    [/^Swap cooler$/i, '更换冷却器'],
    [/^Search S(\d+) coolers(?:\.\.\.|…)$/i, '搜索 S$1 冷却器…'],
    [/^(\d+) S(\d+) coolers fit this port$/i, '有 $1 件 S$2 冷却器适配此接口'],
    [/^S(\d+) coolers fit this port$/i, '件 S$1 冷却器适配此接口'],
    [/^Search S(\d+) weapons(?:\.\.\.|…)$/i, '搜索 S$1 武器…'],
    [/^Search S(\d+) radars(?:\.\.\.|…)$/i, '搜索 S$1 雷达…'],
    [/^Search S(\d+) quantum drives(?:\.\.\.|…)$/i, '搜索 S$1 量子驱动器…'],
    [/^Search S(\d+) shields(?:\.\.\.|…)$/i, '搜索 S$1 护盾…'],
    [/^(\d+) S(\d+) weapons fit this mount$/i, '有 $1 件 S$2 武器适配此挂点'],
    [/^S(\d+) weapons fit this mount$/i, '件 S$1 武器适配此挂点'],
    [/^(\d+) S(\d+) radars fit this port$/i, '有 $1 件 S$2 雷达适配此接口'],
    [/^S(\d+) radars fit this port$/i, '件 S$1 雷达适配此接口'],
    [/^(\d+) S(\d+) quantum drives fit this port$/i, '有 $1 件 S$2 量子驱动器适配此接口'],
    [/^S(\d+) quantum drives fit this port$/i, '件 S$1 量子驱动器适配此接口'],
    [/^(\d+) S(\d+) shields fit this port$/i, '有 $1 件 S$2 护盾适配此接口'],
    [/^S(\d+) shields fit this port$/i, '件 S$1 护盾适配此接口'],
    [/^Install in all (\d+) slots$/i, '安装到全部 $1 个槽位'],
    [/^— whose defenses can this weapon punch through\?$/i, '— 这件武器能击穿哪些目标的防御？'],
    [/^— which guns pierce its defenses\?$/i, '— 哪些武器能够击穿它的防御？'],
    [/^(.+) armor HP$/i, '$1 装甲耐久'],
    [/^(.+) shield HP$/i, '$1 护盾耐久'],
    [/^(PHYS|ENERGY|DIST) defl$/i, '$1 偏转阈值'],
    [/^(.+) alpha \/plt$/i, '$1 单发伤害/弹丸'],
    [/^(.+) alpha$/i, '$1 单发伤害'],
    [/^(\d+) min (\d+)$/i, '$1 分 $2 秒'],
    [/^-click a column to add a secondary sort$/i, '-点击列标题可添加次级排序'],
    [/^Slot (\d+)$/i, '槽位 $1'],
    [/^(\d+) crew$/i, '$1 名乘员'],
    [/^(\d+) ×S(\d+)$/i, '$1 × S$2'],
    [/^full charge (.+)$/i, '完全充能 $1'],
    [/^total dmg$/i, '总伤害'],
    [/^sustained dps$/i, '持续秒伤'],
    [/^factory hull · click to apply a livery$/i, '原厂船体 · 点击应用涂装'],
    [/^of ship demand$/i, '飞船冷却需求'],
    [/^Current power generation · (.+)$/i, '当前发电量 · $1'],
    [/^Remove (.+)$/i, '移除 $1']
  ];

  const attrExact = new Map([
    ['Browse ships by manufacturer', '按制造商浏览飞船'],
    ['Search S4 weapons...', '搜索 S4 武器…'],
    ['Open navigation', '打开导航'],
    ['Reset slots', '重置槽位'],
    ['Component details', '组件详情'],
    ['Where to buy', '购买地点'],
    ['Collapse panel', '折叠面板']
  ]);

  const glossary = {
    DPS: '每秒伤害；爆发值不计入电容恢复、换弹等停火时间',
    ALPHA: '单次射击伤害',
    PEN: '基础穿透距离/深度（米），不是穿甲百分比',
    RATE: '射速（每分钟发射数，RPM）',
    RANGE: '弹丸理论最大射程（米）',
    'MIN RANGE': '雷达开始有效工作的基础距离',
    'MAX RANGE': '雷达的基础最大探测距离',
    BUFFER: '探测距离计算使用的缓冲值',
    'MIN PWR': '组件维持工作的最低电力格数',
    PWR: '该组件最多可以分配的电力格数',
    'POOL HP': '护盾池的总耐久值',
    REGEN: '护盾每秒恢复的耐久值',
    SPEED: '弹丸速度（米/秒）',
    SPREAD: '弹道散布；通常越低越准',
    POWER: '组件需要分配的电力资源，不代表现实单位的持续功耗',
    EM: '组件产生的电磁信号，不等同于直接探测距离',
    AMMO: '实弹携弹量；能量武器由电容决定可用弹量',
    HP: '武器组件自身耐久值'
  };

  // Erkul 的部分可排序表头会把每个单词拆进不同的子节点。
  const compositeExact = new Map([
    ['POOL HP', '护盾容量'],
    ['MIN PWR', '最低配电']
  ]);

  function translated(raw) {
    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.match(/\s*$/)?.[0] ?? '';
    const value = raw.trim();
    if (!value) return raw;
    // 表格标题经常为了排版在单词间插入换行或多个空格。
    const normalized = value.replace(/\s+/g, ' ');
    if (exact.has(normalized)) return leading + exact.get(normalized) + trailing;
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(normalized)) return leading + normalized.replace(pattern, replacement) + trailing;
    }
    return raw;
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    return !parent || parent.closest('script, style, noscript, textarea, [contenteditable="true"], [data-erkul-zh-ignore]');
  }

  function translateText(node) {
    if (!enabled || shouldSkip(node)) return;
    const next = translated(node.nodeValue ?? '');
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateElement(el) {
    if (!enabled || !(el instanceof Element)) return;

    if (!el.hasAttribute('data-erkul-zh-composite')) {
      const textNodes = [];
      const textWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = textWalker.nextNode())) {
        if (textNode.nodeValue?.trim()) textNodes.push(textNode);
      }
      const words = textNodes
        .map((node) => node.nodeValue.trim())
        .filter((part) => !/^[▲▼△▽▴▾]$/.test(part));
      const composite = words.join(' ').replace(/\s+/g, ' ');
      const replacement = compositeExact.get(composite);
      if (replacement) {
        const wordNodes = textNodes.filter((node) => !/^[▲▼△▽▴▾]$/.test(node.nodeValue.trim()));
        if (wordNodes.length) {
          wordNodes[0].nodeValue = replacement;
          for (const node of wordNodes.slice(1)) node.nodeValue = '';
          el.setAttribute('data-erkul-zh-composite', '1');
        }
      }
    }

    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const oldValue = el.getAttribute(attr);
      if (!oldValue) continue;
      const next = attrExact.get(oldValue) ?? translated(oldValue).trim();
      if (next !== oldValue) el.setAttribute(attr, next);
    }

    const original = (el.textContent ?? '').trim();
    if (glossary[original] && !el.hasAttribute('data-erkul-zh-tip')) {
      el.setAttribute('data-erkul-zh-tip', '1');
      if (!el.getAttribute('title')) el.setAttribute('title', glossary[original]);
    }
  }

  function walk(root) {
    if (!enabled || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateText(root);
      return;
    }
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;

    if (root instanceof Element) translateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else translateElement(node);
    }
  }

  let queued = false;
  const pending = new Set();
  function queue(root) {
    pending.add(root);
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const item of pending) walk(item);
      pending.clear();
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') queue(mutation.target);
      else {
        for (const node of mutation.addedNodes) queue(node);
        if (mutation.target instanceof Element) translateElement(mutation.target);
      }
    }
  });

  function start() {
    if (!document.documentElement) return requestAnimationFrame(start);
    document.documentElement.lang = 'zh-CN';
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder']
    });
    walk(document.documentElement);

    if (enabled && document.body && !document.getElementById('erkul-zh-status')) {
      const status = document.createElement('div');
      status.id = 'erkul-zh-status';
      status.dataset.erkulZhIgnore = '1';
      status.textContent = 'Erkul 中文翻译已启用';
      status.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'padding:8px 12px',
        'border:1px solid #f59b23',
        'border-radius:8px',
        'background:#18191d',
        'color:#f4f4f5',
        'font:13px/1.4 system-ui,sans-serif',
        'box-shadow:0 4px 18px #0008',
        'pointer-events:none',
        'opacity:.96',
        'transition:opacity .3s ease'
      ].join(';');
      document.body.appendChild(status);
      setTimeout(() => {
        status.style.opacity = '0';
        setTimeout(() => status.remove(), 350);
      }, 2500);
    }
  }

  GM_registerMenuCommand('切换 Erkul 中文翻译', () => {
    enabled = !enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    // 关闭时刷新以恢复网站原文；开启时刷新可保证所有 React 节点重新翻译。
    location.reload();
  });

  start();
})();
