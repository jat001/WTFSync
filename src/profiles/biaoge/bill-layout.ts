import { raidNames } from './overview-names'

interface BillLayout {
  name: string
  /** Last income group (fines). The next two groups are expenses and totals. */
  lastIncome: number
  bosses?: readonly string[]
}

function layout(name: number | string, lastIncome: number, bosses?: readonly string[]): BillLayout {
  return { name: typeof name === 'number' ? (raidNames.get(name) ?? '其他副本') : name, lastIncome, bosses }
}

// Section positions follow BGLite's DB.lua and DB_BossName.lua.
const layouts = new Map([
  ['MC', layout(409, 13)],
  ['BWL', layout(469, 10)],
  ['ZUG', layout(309, 12)],
  ['AQL', layout(509, 8)],
  ['TAQ', layout(531, 11)],
  ['NAXX', layout(533, 19)],
  ['KZ', layout(532, 13)],
  ['GL', layout('格鲁尔的巢穴与玛瑟里顿', 5)],
  ['SSC', layout('毒蛇神殿与风暴要塞', 12)],
  ['BT', layout(564, 16)],
  ['HS', layout(534, 7)],
  ['SW', layout(580, 8)],
  ['ICC', layout(631, 15)],
  ['TOC', layout(649, 9)],
  ['ULD', layout(603, 16)],
  ['Worldtitan', layout('世界首领', 10, [
    '艾索雷葛斯', '卡扎克', '末日行者', '末日领主卡扎克', '莱索恩', '艾莫莉丝', '泰拉尔', '伊森德雷',
  ])],
  ['MCtitan', layout(409, 12, [
    '鲁西弗隆', '玛格曼达', '基赫纳斯', '加尔', '沙斯拉尔', '迦顿男爵', '萨弗隆先驱者', '古雷曼格', '埃克索图斯', '拉格纳罗斯',
  ])],
  ['SSCtitan', layout('毒蛇神殿与风暴要塞', 12, [
    '海度斯', '鱼斯拉', '盲眼者', '深水领主', '踏潮者', '瓦丝琪', '奥', '空灵机甲', '大星术师', '凯尔萨斯',
  ])],
  ['NAXXtitan', layout('纳克萨玛斯、黑曜石圣殿与永恒之眼', 19, [
    '阿努布雷坎', '法琳娜', '迈克斯纳', '帕奇维克', '格罗布鲁斯', '格拉斯', '塔迪乌斯', '教官拉苏维奥斯', '戈提克',
    '天启四骑士', '诺斯', '希尔盖', '洛欧塞布', '萨菲隆', '克尔苏加德', '萨塔里奥', '玛里苟斯',
  ])],
  ['TOCtitan', layout('祖尔格拉布与十字军的试炼', 17, [
    '耶克里克', '温诺希斯', '玛尔里', '血领主', '疯狂之缘', '钓鱼', '塞卡尔', '娅尔罗', '妖术师金度', '哈卡',
    '诺森德猛兽', '加拉克苏斯', '阵营冠军', '瓦格里双子', '阿努巴拉克',
  ])],
  ['SWtitan', layout('祖阿曼与太阳之井高地', 15, [
    '埃基尔松', '纳洛拉克', '加亚莱', '哈尔拉兹', '妖术领主', '祖尔金', '限时宝箱', '卡雷苟斯', '布鲁塔卢斯',
    '菲米丝', '艾瑞达双子', '穆鲁', '基尔加丹',
  ])],
  ['ULDtitan', layout(603, 16, [
    '烈焰巨兽', '锋鳞', '掌炉者', '拆解者', '钢铁议会', '科隆加恩', '欧尔莉亚', '霍迪尔', '托里姆', '弗蕾亚',
    '米米尔隆', '维扎克斯将军', '尤格萨隆', '奥尔加隆',
  ])],
  ['BOT', layout('暮光堡垒、黑翼血环与风神王座', 15)],
  ['FL', layout(720, 9)],
  ['DS', layout(967, 10)],
  ['MSV', layout('魔古山宝库、恐惧之心与永春台', 18, [
    '石头守卫', '受诅者魔封', '缚灵者戈拉亚', '先王之魂', '伊拉贡', '皇帝的意志', '皇家宰相', '刀锋领主',
    '加拉隆', '风领主', '琥珀塑形者', '大女皇夏柯希尔', '无尽守护者', '烛龙', '雷施', '惧之煞',
  ])],
  ['TOT', layout(1098, 15, [
    '击碎者金罗克', '赫利东', '长者议会', '托多斯', '墨格瑞拉', '季鹍', '遗忘者杜鲁姆', '普利莫修斯',
    '黑暗意志', '铁穹', '神女双天', '雷神', '莱登',
  ])],
  ['SOO', layout(1136, 16, [
    '伊墨苏斯', '堕落的守护者', '诺鲁什', '傲之煞', '迦拉卡斯', '钢铁战蝎', '库卡隆黑暗萨满', '纳兹戈林将军',
    '马尔考罗克', '潘达利亚战利品', '嗜血的索克', '攻城匠师黑索', '卡拉克西英杰', '地狱咆哮',
  ])],
  ['BD', layout(48, 9)],
  ['Gno', layout(90, 8)],
  ['Temple', layout(109, 10)],
  ['MCsod', layout(409, 13)],
  ['ZUGsod', layout(309, 12)],
  ['BWLsod', layout(469, 9)],
  ['Worldsod', layout('世界首领', 10)],
  ['VS', layout('虚空尖塔、梦境裂隙与进军奎尔丹纳斯', 12)],
  ['VA', layout('至暗之夜第二阶段团本', 10)],
])

export function billLayout(raid: string, flavor: string): BillLayout | undefined {
  if (raid === 'NAXX' && flavor === '_classic_era_') return layout(533, 17)
  if (raid === 'BT' && flavor !== '_anniversary_') return layout(564, 11)
  return layouts.get(raid)
}
