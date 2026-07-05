"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Camera,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  IdCard,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MapPin,
  Moon,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ScanLine,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Sun,
  Tag,
  Trash2,
  Upload,
  User,
  Users,
  WalletCards,
  Wrench,
  X
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CheckboxLine,
  Chip,
  ChipGroup,
  ColorSwatchButton,
  ComboField,
  ConfirmDialog,
  DateClearButton,
  DatePresetButton,
  DatePresetGroup,
  Dialog,
  DialogBody,
  DialogFooter,
  Empty,
  Field,
  FieldGroup,
  FieldIcon,
  FormControlLabel,
  ActionSurface,
  BrandItem,
  CategoryPill,
  IconTrigger,
  Input,
  LabeledField,
  MobileMenuCard,
  NavItem,
  NumberStepper,
  OptionItem,
  OptionMenu,
  PhotoUpload,
  ResultButton,
  SearchInput,
  Select,
  SegmentedControl,
  SegmentedControlItem,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Table,
  Tabs,
  TabsTrigger,
  TextLink,
  Textarea,
  Toolbar
} from "@/components/ui";

const ICON = { size: 16, strokeWidth: 1.75 };
const ICON_SM = { size: 14, strokeWidth: 1.75 };
const MONEY_INPUT_PROPS = { type: "text", inputMode: "decimal", pattern: "[0-9]*[.,]?[0-9]*" };

const STORAGE_KEY = "repairnote-next-v1";
const THEME_STORAGE_KEY = "repairnote-theme";
const PAGE_SIZE = 20;
const FINANCE_PAGE_SIZE = 200;
const EMPTY_CLIENT = { name: "", phone: "", identity: "", email: "", address: "" };
const DEFAULT_CLIENT_LEVEL = "VIP";
const clientLevels = [DEFAULT_CLIENT_LEVEL, "超级 VIP", "黑名单"];
const scanShortcutOptions = ["F2", "F4", "F8", "CtrlOrMeta+K"];
const APP_DISPLAY_NAME = "repuestomovil";
const technicianColorOptions = ["#16a34a", "#2563eb", "#dc2626", "#9333ea", "#ea580c", "#0f766e", "#111827"];
const languages = [
  { value: "zh", label: "中文" },
  { value: "es", label: "Español" }
];

const serviceZhMap = {
  "OFERTA BLACK FRIDAY 2025": "黑五优惠 2025",
  "GARANTIA DE 3 MESES": "三个月保修",
  "Funda de movil": "手机壳",
  "Cambiar camara trasera": "更换后置摄像头",
  "Protector hidrogel": "水凝膜",
  "Protector cristal templado iPhone": "iPhone 钢化膜",
  "Protector Cristal UV": "UV 钢化膜",
  "Protector Hidrogel Curvo": "曲面水凝膜",
  "Protector cristal templado": "钢化膜",
  "Cambiar Pantalla Color Negro Con 3 Meses De Garantía": "更换黑色屏幕，三个月保修",
  "Cambiar Pantalla Color Blanco con 3 Meses Garantia": "更换白色屏幕，三个月保修",
  "Cambiar Pantalla Original COLOR NEGRO Con 3 meses Garantia": "更换原装黑色屏幕，三个月保修",
  "Cambiar Pantalla Original COLOR BLANCO Con 3 meses de Garantia": "更换原装白色屏幕，三个月保修",
  "Cambiar Cristal De Pantalla": "更换外屏玻璃",
  "Cambiar Cristal De Cámara Trasera": "更换后摄玻璃",
  "Cambiar Tapa Trasera": "更换后盖",
  "Conector De Carga": "更换充电接口",
  "Cambiar Batería con 3 meses Garantia": "更换电池，三个月保修",
  "Cambiar Batería Original Con 3 meses Garantia": "更换原装电池，三个月保修",
  "Botón Volumen": "音量键",
  "Liberar móvil": "手机解锁",
  "Eliminar Cuenta FRP": "移除 FRP 账号锁",
  "No Enciende / Revisar": "不开机 / 检测",
  "Mojado / No enciende / Revisar": "进水 / 不开机 / 检测",
  "Copia Datos A Móvil Nuevo": "数据转移到新手机",
  "Móvil de Sustitución": "备用手机",
  "Telefono entra apagado, no se puede testear": "手机进店已关机，无法检测",
  "Telefono entra con la pantalla rota,no se puede testear": "手机进店屏幕损坏，无法检测",
  "No se puede testear": "无法检测",
  "Tapa de movil esta rota": "手机后盖损坏",
  "DESCUENTO CLIENTE": "客户折扣",
  "HIDROGEL DESCUENTO": "水凝膜折扣",
  "PROTECTOR DESCUENTO": "贴膜折扣",
  "LE HABIA SALIDO EL MENSAJE DE DETECTADO HUMEDAD": "之前提示检测到潮湿",
  "AHORA NO CARGA": "现在无法充电",
  "BOTON POWER": "电源键",
  "FUNDA": "手机壳",
  "REVIVIR LA BATERIA": "激活电池",
  "REPARAR BISAGRA": "维修转轴"
};

const serviceEsMap = Object.fromEntries(Object.entries(serviceZhMap).map(([es, zh]) => [zh, es]));

const statusOrder = ["预定", "预定到货", "维修中", "完成", "已取走", "取消"];
const statusLabels = {
  预定: "预定",
  预定到货: "预定到货",
  预定已到货: "预定到货",
  待开始: "预定",
  维修中: "维修中",
  完成: "完成",
  已取走: "已取走",
  取消: "取消",
  关闭: "取消",
  待检测: "预定",
  处理中: "维修中",
  等客户确认: "预定到货",
  已完成: "完成",
  拒保: "取消"
};
const statusLabelsEs = {
  预定: "Reserva",
  预定到货: "Reserva llegado",
  预定已到货: "Reserva llegado",
  待开始: "Reserva",
  维修中: "Reparando",
  完成: "Finalizado",
  已取走: "Entregado",
  取消: "Cancelar",
  关闭: "Cancelar",
  待检测: "Reserva",
  处理中: "Reparando",
  等客户确认: "Reserva llegado",
  已完成: "Finalizado",
  拒保: "Cancelar"
};
const statusClassMap = {
  预定: "status-reserva",
  预定到货: "status-arrived",
  预定已到货: "status-arrived",
  待开始: "status-reserva",
  维修中: "status-reparando",
  完成: "status-done",
  已取走: "status-entregado",
  取消: "status-closed",
  关闭: "status-closed",
  待检测: "status-reserva",
  处理中: "status-reparando",
  等客户确认: "status-arrived",
  已完成: "status-done",
  拒保: "status-closed"
};

const warrantyStatusOrder = statusOrder;
const PAGE_PERMISSION_KEYS = ["repairs", "clients", "categories", "modules", "services", "attributes", "technicians", "reports", "finance", "settings", "backup"];
const LEGACY_WHATSAPP_PROGRESS_TEMPLATE = "Hola, puede consultar el estado de su reparación aquí: {url}";
const DEFAULT_WHATSAPP_PROGRESS_TEMPLATE = `Hola {name},

Somos {shop}.
Puede consultar el estado de su reparación aquí:
{url}

Nº de orden: {ticket}
Equipo: {device}

Gracias.`;

function readThemePreference() {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyThemePreference(theme) {
  if (typeof document === "undefined") return;
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // 本地存储不可用时，当前页面仍然即时切换主题。
  }
}

const uiText = {
  zh: {
    appTitle: "repuestomovil",
    loginTitle: "repuestomovil",
    username: "账号",
    password: "密码",
    forgotPassword: "忘记密码",
    login: "登录",
    loginError: "账号或密码不正确",
    userFallback: "员工",
    repairs: "维修单",
    warranties: "保修单",
    clients: "客户",
    category: "分类",
    productCatalog: "商品",
    products: "商品",
    productCategory: "商品分类",
    addProductCategory: "新增分类",
    allProductCategories: "全部分类",
    defaultProductCategory: "默认分类",
    categoryName: "分类名称",
    productService: "服务",
    productPart: "配件",
    menu: "菜单",
    brandModel: "品牌 / 型号",
    parts: "配件",
    services: "服务",
    attributes: "属性",
    staff: "员工",
    technicians: "维修师",
    technician: "维修师",
    reports: "报表",
    finance: "财务",
    settings: "设置",
    backup: "备份",
    logout: "退出登录",
    changelog: "更新记录",
    themeDark: "黑夜模式",
    themeLight: "白天模式",
    add: "新增",
    newOrderButton: "新建订单 / Nueva orden",
    scanOrder: "扫描订单",
    addBrand: "新增品牌",
    addModel: "新增型号",
    edit: "编辑",
    delete: "删除",
    save: "保存",
    create: "创建",
    cancel: "取消",
    confirmTitle: "请确认",
    confirmAction: "确定",
    search: "搜索",
    refresh: "刷新",
    type: "类型",
    data: "数据",
    actions: "操作",
    allStatus: "全部状态",
    ticket: "单号",
    clientName: "客户姓名",
    client: "客户",
    phone: "电话",
    email: "邮箱",
    address: "地址",
    identity: "证件号",
    level: "等级",
    operation: "操作",
    name: "名称",
    defaultName: "默认名",
    chinese: "中文",
    spanish: "西语",
    price: "价格",
    group: "分组",
    groupColor: "颜色",
    groupOther: "其他",
    model: "型号",
    issue: "维修内容",
    status: "状态",
    orderDate: "订单日期",
    repairTime: "维修时间",
    warrantyStart: "保修开始时间",
    warrantyEnd: "保修到期时间",
    warrantyPeriod: "保修周期",
    warrantyActiveNotice: "保修期剩余 {days} 天，到期 {date}",
    warrantyExpiredNotice: "保修已过期：已开始 {days} 天，到期 {date}",
    completedNotPickedNotice: "已完成 {days} 天未取走",
    noData: "暂无数据",
    repairRecords: "维修记录",
    latestRepair: "最近维修",
    noRepairRecords: "暂无维修记录",
    clientOrders: "客户订单",
    backToClients: "返回客户",
    clientFilterAll: "全部客户",
    clientFilterOpen: "有未完成",
    clientFilterRecords: "有维修记录",
    clientFilterNoRecords: "无维修记录",
    clientSortLatest: "最近维修优先",
    clientSortRecords: "维修次数多",
    clientSortOpen: "未完成多",
    clientSortName: "姓名排序",
    repairNotFound: "没有找到这张维修单",
    times: "次",
    unfinished: "未完成",
    unsavedChangesConfirm: "有修改尚未保存。点击“取消”留在当前页面保存，点击“确定”不保存并离开。",
    loading: "加载中",
    jumpTo: "跳至",
    customerInfo: "客户信息",
    inputPhoneSearch: "先输入客户电话搜索",
    docTypePassport: "护照",
    saveNewClient: "保存新客户",
    orderType: "单据类型",
    repairOrder: "维修单",
    repairInfo: "维修信息",
    brand: "品牌",
    property: "属性",
    repairNote: "维修备注",
    internalNote: "内部备注，不打印",
    passwordType: "密码类型",
    patternPassword: "手势密码",
    textPassword: "文字密码",
    serviceTab: "维修内容 / 服务",
    partsTab: "配件",
    frontPhoto: "正面照片",
    backPhoto: "背面照片",
    noUpload: "未上传",
    upload: "上传",
    customerSignature: "客户签字",
    unsigned: "未签字",
    quote: "报价 €",
    discount: "优惠 €",
    deposit: "订金 €",
    depositPrint: "订金",
    costAmount: "成本 €",
    profitAmount: "利润",
    itemName: "项目名称",
    qty: "数量",
    unitPrice: "单价",
    itemCost: "成本",
    quickEditCosts: "快速改成本",
    discountPercent: "折扣 %",
    subtotal: "小计",
    itemsTotal: "项目合计",
    summary: "合计",
    total: "总价",
    totalPrint: "总价",
    due: "待收款",
    dueAfterDeposit: "扣除订金后待收款",
    paymentEntry: "收款",
    printReceipt: "打印小票",
    printA4: "打印 A4",
    printWarrantyReceipt: "打印保修小票",
    printWarrantyA4: "打印保修 A4",
    paymentMethod: "付款方式",
    paymentMethodNone: "无",
    paymentMethodCash: "现金",
    paymentMethodCard: "刷卡",
    qrTitle: "二维码进度页",
    openProgressPage: "打开进度页",
    sendWhatsapp: "发送 WhatsApp",
    sendReceiptWhatsapp: "发送小票",
    sendCurrentReceiptWhatsapp: "发送当前小票",
    receiptWhatsappDisabled: "客户没有手机号，不能发送小票",
    receiptImage: "小票图片",
    receiptImageSaved: "小票图片已生成",
    receiptImageFailed: "小票图片生成失败",
    paid: "收款",
    paymentButton: "付款",
    paymentButtonHelper: "首次付款打印维修小票 2 张，不改订单状态",
    paymentFollowupHelper: "继续收款只保存流水；付清后选择是否保修",
    paymentReceivedButton: "已付款",
    paymentReceivedHelper: "已付清，订单已取走",
    fullPaidNoWarrantyHelper: "点击后标记已取走并打印 1 张维修小票",
    finalPaymentButton: "收尾款",
    recordDepositPayment: "订金收款",
    recordDepositAndCreate: "创建订单并收订金",
    depositPaidHelper: "收完自动打印维修小票，不改订单状态",
    paidCloseHelper: "收完自动打印维修小票并已取走",
    paidConfirm: "确认收款并将单据修改为已取走？",
    paidWarrantyButton: "启动保修",
    paidWarrantyHelper: "已付清，只改为已取走并启动保修",
    paymentConfirmTitle: "确认收款",
    paymentCalculatorHint: "首次付款按订金记录，后续付款按收款流水记录",
    paymentFullAmount: "全款",
    paymentClear: "清空",
    paymentBackspace: "退格",
    paymentAmountRequired: "请填写实收金额",
    paymentExceedsDue: "收款金额已超过待收款，将按待收款记录并显示找零",
    paymentWarrantyPrompt: "已收全款，是否进行保修并标记已完成？",
    paymentWarrantyConfirm: "进行保修",
    paymentWarrantySkip: "暂不保修",
    finalPaymentReceiveAmount: "实收金额 €",
    finalPaymentDueAmount: "应收",
    finalPaymentChangeAmount: "找零",
    finalPaymentInsufficient: "实收金额不能少于待收款",
    depositPaidConfirm: "确认记录这笔订金收款？",
    depositPaymentRequired: "请先填写订金金额",
    depositPaymentExceedsTotal: "订金不能超过总价",
    depositManageButton: "调整订金",
    depositAdjustTitle: "调整订金",
    depositAdjustHelper: "通过差额流水调整订金，保留历史记录，不改订单状态",
    depositCurrentAmount: "当前订金",
    depositTargetAmount: "目标订金 €",
    depositAdjustmentAmount: "调整差额",
    depositAdjustmentEntry: "订金调整",
    depositAdjustmentTo: "订金调整至",
    depositAdjustmentNone: "目标订金与当前相同",
    depositAdjustmentInvalid: "目标订金无效",
    depositAdjustmentExceedsPaid: "调整后总收款不能超过订单总价",
    depositAdjustmentNegativePaid: "调整后总收款不能小于 0",
    depositAdjustmentRecorded: "订金已调整",
    paymentManageButton: "调整收款",
    paymentAdjustTitle: "调整收款",
    paymentAdjustHelper: "通过差额流水调整已收金额，保留历史记录，不改订单状态",
    paymentAdjustHelperPartial: "修改目标已收总额（如 10→15），不按笔追加；也可继续用右侧「付款」收余款",
    paymentCurrentAmount: "当前已收",
    paymentTargetAmount: "目标已收 €",
    paidAdjustmentEntry: "收款调整",
    paidAdjustmentTo: "收款调整至",
    paidAdjustmentRecorded: "收款已调整",
    warrantyPaymentChargeRequired: "请先勾选「需要收费」并添加收费项目",
    warrantyMarkDoneButton: "标记完成",
    warrantyMarkDoneHelper: "已付清，将保修单标记为完成",
    paymentNoPendingAmount: "没有可收款金额",
    paymentRecordedPrintFailed: "收款已记录，但打印窗口被拦截或已关闭。请允许弹窗后再点打印小票。",
    cancelLockConfirm: "选择取消后，这张订单会被锁定，不能继续编辑。确定取消并锁定吗？",
    orderLocked: "订单已锁定",
    orderLockedHint: "这张订单已进入最终状态并锁定，解除锁定后才可以继续编辑。",
    unlockOrder: "解除锁定",
    unlockOrderConfirm: "确定解除锁定并允许继续编辑这张订单吗？",
    orderUnlocked: "订单已解除锁定",
    allowOrderUnlock: "允许解除订单锁定（仅管理员可操作）",
    enableOrderLock: "启用订单锁定",
    orderLockedAdminOnly: "这张订单已锁定，只有管理员可以解除锁定。",
    displayControls: "详情显示控制",
    showPasswordSection: "显示密码区域",
    showPhotoSection: "显示照片区域",
    showSignatureSection: "显示签名区域",
    showQrNoticeSection: "显示二维码 / 通知记录区域",
    notificationLog: "通知记录",
    copyEmail: "复制邮件内容",
    markNotified: "标记已通知",
    notified: "已通知",
    noNotifications: "暂无通知记录",
    patternHint: "按住白点滑动记录方向",
    clear: "清除",
    currentPattern: "当前顺序",
    unset: "未设置",
    confirmSave: "确认保存",
    phoneAndNameRequired: "客户姓名和电话必填",
    clientSaved: "客户已保存",
    blacklistAlert: "黑名单客户：可继续开单，但请先确认风险。",
    blacklistToast: "注意：该客户是黑名单客户",
    requiredRepairFields: "客户、品牌和型号必填",
    repairCreated: "维修单已创建",
    repairSaved: "维修单已保存",
    newOrderSameClient: "同客户新建订单",
    repairDeleted: "维修单已删除",
    confirmDeleteRepair: "确认删除这张维修单？",
    cannotDeleteRepairWithWarranty: "这张维修单已关联保修单，请先删除保修单",
    addWarrantyOrder: "开保修单",
    warrantyOrder: "保修单",
    warrantyOrders: "保修单",
    warrantyTicket: "保修单号",
    sourceRepair: "原维修单",
    sourceRepairTicket: "原维修单号",
    warrantyIssue: "客户反馈问题",
    warrantyDiagnosis: "检测结果",
    warrantyResolution: "处理方式",
    warrantyChargeable: "需要收费",
    warrantyAmount: "保修收费",
    warrantyLinkedOrders: "关联保修单",
    warrantyCreated: "保修单已创建",
    warrantySaved: "保修单已保存",
    warrantyDeleted: "保修单已删除",
    confirmDeleteWarranty: "确认删除这张保修单？",
    requiredWarrantyFields: "原维修单、客户反馈问题必填",
    noSourceRepair: "没有找到原维修单",
    warrantyStatusPending: "预定",
    warrantyStatusProcessing: "维修中",
    warrantyStatusWaiting: "预定到货",
    warrantyStatusDone: "完成",
    warrantyStatusRejected: "取消",
    saved: "已保存",
    created: "已创建",
    saveFailed: "保存失败",
    statusUpdated: "状态已更新",
    cannotDeleteClient: "该客户已有维修单，不能直接删除",
    cannotDeleteBrand: "该品牌还有型号，不能直接删除",
    cannotDeleteModel: "该型号已有维修单，不能直接删除",
    confirmDeleteClient: "确认删除客户？",
    confirmDeleteBrand: "确认删除品牌？",
    confirmDeleteModel: "确认删除型号？",
    confirmDelete: "确认删除？",
    confirmDeleteAttribute: "确认删除属性？",
    confirmDeleteStaff: "确认删除员工？",
    confirmDeleteTechnician: "确认删除维修师？",
    cannotDeleteTechnician: "该维修师已有维修单，不能直接删除",
    deleteHistoricalRecords: "删除历史记录",
    confirmDeleteHistoricalRecords: "确认删除这组历史记录吗？这会删除该行对应的历史订单。",
    historicalRecordsDeleted: "历史记录已删除",
    currentUserCannotDelete: "当前登录账号不可删除",
    lastAdminCannotDelete: "最后一个管理员不可删除",
    admin: "管理员",
    employee: "员工",
    role: "角色",
    pagePermissions: "页面权限",
    pageAccess: "可见页面",
    allPages: "全部页面",
    noPageAccess: "未设置页面权限",
    noPermission: "没有权限访问这个页面",
    fullName: "姓名",
    staffUsername: "用户名",
    technicianPhone: "电话",
    technicianColor: "颜色",
    newPassword: "密码",
    keepPassword: "留空则不改密码",
    today: "今天",
    yesterday: "昨天",
    dayBeforeYesterday: "前天",
    last7Days: "一周",
    lastMonth: "1个月",
    last14Days: "14 天",
    week: "这周",
    month: "这个月",
    year: "今年",
    customRange: "自定义时间",
    quickDateRange: "快捷日期",
    startDate: "开始日期",
    endDate: "结束日期",
    datePlaceholder: "年/月/日",
    monthRevenue: "营业额",
    revenueTrend: "营业额趋势",
    trendDaily: "每天",
    trendWeekly: "每周",
    trendMonthly: "每月",
    trendMetricAmount: "金额",
    trendMetricOrders: "单数",
    trendMetricBoth: "两者",
    repairCount: "维修单数量",
    warrantyCount: "保修单数量",
    orderCount: "工单数量",
    orders: "订单",
    unpaidAmount: "未收款金额",
    receivedAmount: "已收金额",
    repairAmount: "维修金额",
    financeTitle: "财务总览",
    dailyBusiness: "每日经营",
    dailyCollected: "今日收款",
    dailyDepositCollected: "订金",
    dailyFinalCollected: "尾款",
    dailyOrders: "今日开单",
    dailyUnpaid: "今日待收",
    dailyCost: "今日成本",
    dailyProfit: "今日利润",
    dailyPaymentCount: "今日收款笔数",
    financeReceivable: "应收总额",
    financeReceived: "实收款",
    financeCost: "成本",
    financeProfit: "利润",
    paymentCount: "收款笔数",
    paymentRecords: "收款流水",
    unpaidOrders: "未收款订单",
    paidAmount: "已收款",
    paymentAmount: "收款金额",
    paymentDate: "收款时间",
    paymentNote: "备注",
    paymentHistory: "收款记录",
    noPayments: "暂无收款记录",
    finalPayment: "尾款",
    depositPayment: "订金",
    paymentRecorded: "收款已记录",
    showingLimitedRows: "为避免卡顿，当前只显示前 {shown} 条，共 {total} 条。可搜索或缩小日期范围。",
    paginationSummary: "第 {page} / {pages} 页，共 {total} 条",
    repairListSummary: "当前筛选合计",
    filteredRepairOrders: "维修单",
    filteredWarrantyOrders: "保修单",
    technicianRangeStats: "维修师统计",
    quickFindPrint: "扫条码找单",
    scanShortcut: "扫码快捷键",
    scanShortcutTitle: "扫码找单",
    quickFindTitle: "快速扫条码找单",
    quickFindHint: "扫描小票上的一维条形码，或直接输入条码下方的订单号，找到后直接打开订单详情。",
    quickOrderInput: "扫描条码或输入订单号",
    scanGunHint: "把小票条形码对准摄像头；扫描枪扫完按回车会自动打开订单。",
    globalScanOpen: "已打开维修单 {ticket}",
    barcodeScanGuide: "对准小票上的条形码",
    startCamera: "打开摄像头",
    stopCamera: "关闭摄像头",
    cameraUnsupported: "当前浏览器不支持直接识别条码，可以使用扫描枪或手动输入。",
    cameraError: "摄像头无法打开，请检查浏览器权限。",
    openOrder: "打开订单",
    exactMatchOpen: "找到订单，正在打开。",
    noOrderFound: "没有找到对应订单",
    technicianPerformance: "维修师业绩",
    technicianRepairOrders: "维修单",
    technicianWarrantyOrders: "保修单",
    technicianOpenOrders: "未完成",
    technicianTodayProfit: "今日利润",
    technicianRepairRevenue: "维修金额",
    technicianRepairProfit: "维修利润",
    technicianWarrantyLoss: "保修损耗",
    technicianOrders: "维修师订单",
    backToTechnicians: "返回维修师",
    assignedTechnician: "维修师",
    unassignedTechnician: "未分配",
    historicalTechnician: "历史",
    topModels: "热门手机型号",
    topModelsChart: "热门型号柱状图",
    topBrands: "热门品牌",
    topServices: "热门维修项目",
    statusDistribution: "状态分布",
    languageTab: "语言",
    printSettings: "打印设置",
    otherSettings: "其他设置",
    terms: "条款",
    businessInfo: "门店资料",
    customerAccess: "客户访问",
    printLanguage: "打印语言",
    defaultWarrantyDuration: "默认保修天数",
    termsTemplates: "条款模板",
    shopName: "店铺名称",
    shopAddress: "店铺地址",
    shopTaxId: "CIF / 税号",
    publicBaseUrl: "客户进度页地址",
    publicBaseUrlPlaceholder: "https://example.com 或 http://192.168.1.64:3000",
    whatsappTemplate: "WhatsApp 进度话术",
    whatsappTemplatePlaceholder: "支持 {name} 客户、{shop} 门店、{url} 进度链接、{ticket} 单号、{device} 设备、{status} 状态",
    contactPhone: "联系电话",
    taxRate: "税率",
    hideIssuer: "不打印出票人",
    reservationTerms: "预定条款",
    repairTerms: "维修条款",
    warrantyTerms: "保修条款",
    settingsSaved: "设置已保存",
    exportJson: "导出数据库 JSON",
    downloadCurrentBackup: "下载当前备份",
    uploadBackupFile: "上传备份文件",
    createBackupNow: "立即生成备份",
    backupHistory: "历史备份",
    backupAutoHint: "系统会在每天第一次保存数据时自动留一份备份。",
    backupManualHint: "也可以随时手动生成一份，并下载 ZIP 压缩包到自己电脑保存。",
    backupCreated: "备份已生成",
    backupRestored: "备份已恢复",
    backupDownloaded: "备份已开始下载",
    backupFileImported: "备份文件已导入",
    externalHistoryImport: "外部历史导入",
    externalHistoryImportHint: "用于导入 Reparacionmovil.Es 这类外部 JSON。导入前会自动安全备份，并合并为“历史”订单。",
    externalHistoryFile: "外部 JSON 文件",
    amountKeepStartDate: "保留金额开始日期",
    amountKeepEndDate: "保留金额结束日期",
    importExternalHistory: "导入外部历史",
    externalHistoryNoFile: "请先选择外部历史 JSON 文件",
    externalHistoryImported: "外部历史已导入：新增 {added} 张，跳过 {skipped} 张，{zeroed} 张金额清零",
    externalHistoryProgressUploading: "正在上传文件",
    externalHistoryProgressProcessing: "正在解析并写入数据库，数据较多时需要几分钟",
    externalHistoryProgressRefreshing: "正在刷新页面数据",
    externalHistoryProgressDone: "导入完成",
    invalidBackupFile: "备份文件格式不正确",
    restoreBackup: "恢复",
    downloadBackup: "下载",
    backupKindAuto: "自动",
    backupKindManual: "手动",
    backupKindSafety: "安全",
    backupEmpty: "还没有历史备份，可以先点“立即生成备份”。",
    backupCounts: "{clients} 个客户 / {repairs} 张工单",
    confirmRestoreBackup: "确定恢复这份备份吗？当前数据会先自动保存一份安全备份。",
    advancedJsonImport: "高级导入",
    importJson: "导入 JSON",
    importLocalStorage: "导入旧 localStorage",
    backupPlaceholder: "导出的 JSON 会显示在这里，也可以粘贴 JSON 后导入",
    backupExported: "备份已导出",
    pasteJsonFirst: "请先粘贴备份 JSON",
    invalidBackup: "备份 JSON 格式不正确",
    backupImported: "备份已导入",
    noOldData: "浏览器里没有旧数据",
    importedRepairs: "已导入 {count} 张维修单",
    publicStatusTitle: "维修进度",
    publicNotFound: "没有找到这张维修单。",
    updatedAt: "更新时间",
    publicHint: "如需咨询，请联系店铺并提供维修单号。",
    receiptTitle: "repuestomovil 小票",
    a4Title: "repuestomovil 维修确认单",
    repairDocTitle: "维修确认单",
    reservationDocTitle: "预定确认单",
    warrantyDocTitle: "保修确认单",
    clientSection: "客户",
    repairSection: "维修",
    ticketBarcode: "单号条码",
    progressQr: "进度二维码",
    scanProgress: "扫码查看维修进度",
    imeiSn: "IMEI / SN",
    passwordPrint: "密码",
    printProblem: "问题 / Fallos",
    taxableBase: "税前金额",
    taxQuota: "税额",
    device: "设备",
    date: "日期",
    monthLabel: "个月",
    dayLabel: "天",
    photos: "照片",
    signature: "签字",
    acceptedTerms: "客户已阅读并接受以上条款",
    acceptedTermsCompact: "客户已确认维修条款",
    customerSignature: "客户签字",
    pickupSignature: "取机签字",
    shopSignature: "店铺签章",
    progress: "维修进度"
  },
  es: {
    appTitle: "repuestomovil",
    loginTitle: "repuestomovil",
    username: "Usuario",
    password: "Contraseña",
    forgotPassword: "Olvidé mi contraseña",
    login: "Entrar",
    loginError: "Usuario o contraseña incorrectos",
    userFallback: "Empleado",
    repairs: "Reparaciones",
    warranties: "Garantías",
    clients: "Clientes",
    category: "Categoría",
    productCatalog: "Productos",
    products: "Productos",
    productCategory: "Categoría de producto",
    addProductCategory: "Añadir categoría",
    allProductCategories: "Todas las categorías",
    defaultProductCategory: "Sin categoría",
    categoryName: "Nombre de categoría",
    productService: "Servicio",
    productPart: "Repuesto",
    menu: "Menú",
    brandModel: "Marca / Modelo",
    parts: "Repuestos",
    services: "Servicios",
    attributes: "Atributos",
    staff: "Personal",
    technicians: "Técnicos",
    technician: "Técnico",
    reports: "Informes",
    finance: "Caja",
    settings: "Ajustes",
    backup: "Copias",
    logout: "Cerrar sesión",
    changelog: "Registro de cambios",
    themeDark: "Modo noche",
    themeLight: "Modo día",
    add: "Añadir",
    newOrderButton: "Nueva orden",
    scanOrder: "Escanear orden",
    addBrand: "Añadir marca",
    addModel: "Añadir modelo",
    edit: "Editar",
    delete: "Eliminar",
    save: "Guardar",
    create: "Crear",
    cancel: "Cancelar",
    confirmTitle: "Confirmación",
    confirmAction: "Confirmar",
    search: "Buscar",
    refresh: "Actualizar",
    type: "Tipo",
    data: "Datos",
    actions: "Acciones",
    allStatus: "Todos",
    ticket: "Ticket Nº",
    clientName: "Nombre y apellidos",
    client: "Cliente",
    phone: "Tel.",
    email: "Email",
    address: "Dirección",
    identity: "Identificación",
    level: "Nivel",
    operation: "Acciones",
    name: "Nombre",
    defaultName: "Nombre base",
    chinese: "zh",
    spanish: "es",
    price: "Precio",
    group: "Grupo",
    groupColor: "Color",
    groupOther: "Otros",
    model: "Modelo",
    issue: "Incidencia",
    status: "Estado",
    orderDate: "Fecha pedido",
    repairTime: "Tiempo de reparación",
    warrantyStart: "Inicio de garantía",
    warrantyEnd: "Fin de garantía",
    warrantyPeriod: "Duración de garantía",
    warrantyActiveNotice: "Garantía: quedan {days} días, vence {date}",
    warrantyExpiredNotice: "Garantía vencida: {days} días, venció {date}",
    completedNotPickedNotice: "Finalizado hace {days} días, sin recoger",
    noData: "Sin datos",
    repairRecords: "Historial",
    latestRepair: "Última reparación",
    noRepairRecords: "Sin reparaciones",
    clientOrders: "Órdenes del cliente",
    backToClients: "Volver a clientes",
    clientFilterAll: "Todos los clientes",
    clientFilterOpen: "Con pendientes",
    clientFilterRecords: "Con historial",
    clientFilterNoRecords: "Sin historial",
    clientSortLatest: "Última reparación",
    clientSortRecords: "Más reparaciones",
    clientSortOpen: "Más pendientes",
    clientSortName: "Orden por nombre",
    repairNotFound: "No se encontró esta reparación",
    times: "veces",
    unfinished: "sin terminar",
    unsavedChangesConfirm: "Hay cambios sin guardar. Pulsa Cancelar para seguir editando y guardar, o Aceptar para salir sin guardar.",
    loading: "Cargando",
    jumpTo: "Ir a",
    customerInfo: "Usuario",
    inputPhoneSearch: "Buscar por teléfono",
    docTypePassport: "Pasaporte",
    saveNewClient: "Guardar nuevo usuario",
    orderType: "Tipo de orden",
    repairOrder: "Reparación",
    repairInfo: "Información de reparación",
    brand: "Marca",
    property: "Propiedades",
    repairNote: "Comentario",
    internalNote: "Nota interna, no se imprime",
    passwordType: "Tipo de contraseña",
    patternPassword: "Patrón",
    textPassword: "Contraseña",
    serviceTab: "Incidencia / Servicios",
    partsTab: "Repuestos",
    frontPhoto: "Foto frontal",
    backPhoto: "Foto trasera",
    noUpload: "Sin subir",
    upload: "Subir",
    customerSignature: "Firma del cliente",
    unsigned: "Sin firmar",
    quote: "Presupuesto €",
    discount: "Descuento €",
    deposit: "Paga y señal €",
    depositPrint: "Señal",
    costAmount: "Coste €",
    profitAmount: "Beneficio",
    itemName: "Nombre",
    qty: "Cantidad",
    unitPrice: "Prec. unit.",
    itemCost: "Coste",
    quickEditCosts: "Editar costes",
    discountPercent: "Descuento %",
    subtotal: "Subtotal",
    itemsTotal: "Total productos",
    summary: "Total",
    total: "Precio total",
    totalPrint: "Total",
    due: "Pendiente",
    dueAfterDeposit: "Pendiente después del depósito",
    paymentEntry: "Cobro",
    printReceipt: "Imprimir ticket",
    printA4: "Imprimir A4",
    printWarrantyReceipt: "Imprimir ticket de garantía",
    printWarrantyA4: "Imprimir garantía A4",
    paymentMethod: "Forma de pago",
    paymentMethodNone: "Efectivo",
    paymentMethodCash: "Efectivo",
    paymentMethodCard: "Tarjeta",
    qrTitle: "Página de seguimiento",
    openProgressPage: "Abrir seguimiento",
    sendWhatsapp: "Enviar WhatsApp",
    sendReceiptWhatsapp: "Enviar ticket",
    sendCurrentReceiptWhatsapp: "Enviar ticket actual",
    receiptWhatsappDisabled: "Sin teléfono de cliente",
    receiptImage: "Imagen ticket",
    receiptImageSaved: "Imagen del ticket generada",
    receiptImageFailed: "No se pudo generar la imagen",
    paid: "Cobrar",
    paymentButton: "Cobrar",
    paymentButtonHelper: "El primer cobro imprime 2 tickets y no cambia el estado",
    paymentFollowupHelper: "Los siguientes cobros solo guardan el movimiento",
    paymentReceivedButton: "Pagado",
    paymentReceivedHelper: "Pagado y entregado",
    fullPaidNoWarrantyHelper: "Marca entregado e imprime 1 ticket de reparación",
    finalPaymentButton: "Cobrar restante",
    recordDepositPayment: "Cobrar depósito",
    recordDepositAndCreate: "Crear orden y cobrar depósito",
    depositPaidHelper: "Imprime ticket sin cambiar el estado",
    paidCloseHelper: "Imprime ticket y marca entregado",
    paidConfirm: "¿Confirmar el pago y marcar la orden como entregada?",
    paidWarrantyButton: "Iniciar garantía",
    paidWarrantyHelper: "Ya está pagado: marca entregado e inicia garantía",
    paymentConfirmTitle: "Confirmar cobro",
    paymentCalculatorHint: "El primer cobro se registra como depósito; los siguientes como movimientos",
    paymentFullAmount: "Total",
    paymentClear: "Borrar",
    paymentBackspace: "Retroceso",
    paymentAmountRequired: "Introduce el importe recibido",
    paymentExceedsDue: "El importe supera lo pendiente; se registrará solo lo pendiente y se mostrará cambio",
    paymentWarrantyPrompt: "Pago completo. ¿Iniciar garantía y marcar como terminado?",
    paymentWarrantyConfirm: "Iniciar garantía",
    paymentWarrantySkip: "Sin garantía",
    finalPaymentReceiveAmount: "Importe recibido €",
    finalPaymentDueAmount: "A cobrar",
    finalPaymentChangeAmount: "Cambio",
    finalPaymentInsufficient: "El importe recibido no puede ser menor que el pendiente",
    depositPaidConfirm: "¿Registrar este depósito?",
    depositPaymentRequired: "Introduce primero el depósito",
    depositPaymentExceedsTotal: "El depósito no puede superar el total",
    depositManageButton: "Ajustar depósito",
    depositAdjustTitle: "Ajustar depósito",
    depositAdjustHelper: "Ajusta el depósito con un movimiento de diferencia; conserva el historial y no cambia el estado",
    depositCurrentAmount: "Depósito actual",
    depositTargetAmount: "Depósito objetivo €",
    depositAdjustmentAmount: "Diferencia",
    depositAdjustmentEntry: "Ajuste de depósito",
    depositAdjustmentTo: "Depósito ajustado a",
    depositAdjustmentNone: "El depósito objetivo es igual al actual",
    depositAdjustmentInvalid: "Depósito objetivo no válido",
    depositAdjustmentExceedsPaid: "El total cobrado no puede superar el total de la orden",
    depositAdjustmentNegativePaid: "El total cobrado no puede ser menor que 0",
    depositAdjustmentRecorded: "Depósito ajustado",
    paymentManageButton: "Ajustar cobro",
    paymentAdjustTitle: "Ajustar cobro",
    paymentAdjustHelper: "Ajusta lo cobrado con un movimiento de diferencia; conserva el historial y no cambia el estado",
    paymentAdjustHelperPartial: "Cambia el total cobrado objetivo (p. ej. 10→15), sin añadir líneas; también puedes usar «Cobrar» a la derecha",
    paymentCurrentAmount: "Cobrado actual",
    paymentTargetAmount: "Objetivo cobrado €",
    paidAdjustmentEntry: "Ajuste de cobro",
    paidAdjustmentTo: "Cobro ajustado a",
    paidAdjustmentRecorded: "Cobro ajustado",
    warrantyPaymentChargeRequired: "Marca «Con cargo» y añade líneas con importe",
    warrantyMarkDoneButton: "Marcar finalizado",
    warrantyMarkDoneHelper: "Pagado: marcar la garantía como finalizada",
    paymentNoPendingAmount: "No hay importe pendiente",
    paymentRecordedPrintFailed: "Cobro registrado, pero la ventana de impresión fue bloqueada o cerrada. Permite ventanas emergentes y vuelve a imprimir el ticket.",
    cancelLockConfirm: "Al cancelar, esta orden quedará bloqueada y no se podrá editar. ¿Confirmar cancelación y bloqueo?",
    orderLocked: "Orden bloqueada",
    orderLockedHint: "Esta orden está en estado final y bloqueada. Desbloquéala para poder editarla.",
    unlockOrder: "Desbloquear",
    unlockOrderConfirm: "¿Desbloquear esta orden y permitir la edición?",
    orderUnlocked: "Orden desbloqueada",
    allowOrderUnlock: "Permitir desbloquear órdenes (solo administrador)",
    enableOrderLock: "Activar bloqueo de órdenes",
    orderLockedAdminOnly: "Orden bloqueada. Solo el administrador puede desbloquearla.",
    displayControls: "Control de visualización",
    showPasswordSection: "Mostrar zona de contraseña",
    showPhotoSection: "Mostrar fotos",
    showSignatureSection: "Mostrar firma",
    showQrNoticeSection: "Mostrar QR / avisos",
    notificationLog: "Registro de avisos",
    copyEmail: "Copiar email",
    markNotified: "Marcar avisado",
    notified: "Avisado",
    noNotifications: "Sin avisos",
    patternHint: "Mantén pulsado y desliza para guardar el patrón",
    clear: "Limpiar",
    currentPattern: "Orden actual",
    unset: "Sin configurar",
    confirmSave: "Guardar firma",
    phoneAndNameRequired: "Nombre y teléfono son obligatorios",
    clientSaved: "Cliente guardado",
    blacklistAlert: "Cliente en lista negra: se puede continuar, pero revisa el riesgo.",
    blacklistToast: "Atención: este cliente está en lista negra",
    requiredRepairFields: "Cliente, marca y modelo son obligatorios",
    repairCreated: "Reparación creada",
    repairSaved: "Reparación guardada",
    newOrderSameClient: "Nueva orden mismo cliente",
    repairDeleted: "Reparación eliminada",
    confirmDeleteRepair: "¿Eliminar esta reparación?",
    cannotDeleteRepairWithWarranty: "Esta reparación tiene garantías relacionadas. Elimine primero las garantías.",
    addWarrantyOrder: "Crear garantía",
    warrantyOrder: "Garantía",
    warrantyOrders: "Garantías",
    warrantyTicket: "Nº garantía",
    sourceRepair: "Reparación original",
    sourceRepairTicket: "Nº reparación original",
    warrantyIssue: "Problema del cliente",
    warrantyDiagnosis: "Resultado de revisión",
    warrantyResolution: "Solución",
    warrantyChargeable: "Con cargo",
    warrantyAmount: "Importe garantía",
    warrantyLinkedOrders: "Garantías relacionadas",
    warrantyCreated: "Garantía creada",
    warrantySaved: "Garantía guardada",
    warrantyDeleted: "Garantía eliminada",
    confirmDeleteWarranty: "¿Eliminar esta garantía?",
    requiredWarrantyFields: "Reparación original y problema son obligatorios",
    noSourceRepair: "No se encontró la reparación original",
    warrantyStatusPending: "Reserva",
    warrantyStatusProcessing: "Reparando",
    warrantyStatusWaiting: "Reserva llegado",
    warrantyStatusDone: "Finalizado",
    warrantyStatusRejected: "Cancelar",
    saved: "Guardado",
    created: "Creado",
    saveFailed: "Error al guardar",
    statusUpdated: "Estado actualizado",
    cannotDeleteClient: "Este cliente tiene reparaciones y no se puede eliminar directamente",
    cannotDeleteBrand: "Esta marca tiene modelos y no se puede eliminar directamente",
    cannotDeleteModel: "Este modelo tiene reparaciones y no se puede eliminar directamente",
    confirmDeleteClient: "¿Eliminar cliente?",
    confirmDeleteBrand: "¿Eliminar marca?",
    confirmDeleteModel: "¿Eliminar modelo?",
    confirmDelete: "¿Eliminar?",
    confirmDeleteAttribute: "¿Eliminar atributo?",
    confirmDeleteStaff: "¿Eliminar empleado?",
    confirmDeleteTechnician: "¿Eliminar técnico?",
    cannotDeleteTechnician: "Este técnico tiene reparaciones y no se puede eliminar directamente",
    deleteHistoricalRecords: "Eliminar histórico",
    confirmDeleteHistoricalRecords: "¿Eliminar este grupo de registros históricos? Se eliminarán las órdenes de esta fila.",
    historicalRecordsDeleted: "Histórico eliminado",
    currentUserCannotDelete: "No se puede eliminar el usuario actual",
    lastAdminCannotDelete: "No se puede eliminar el último administrador",
    admin: "Administrador",
    employee: "Empleado",
    role: "Rol",
    pagePermissions: "Permisos de páginas",
    pageAccess: "Páginas visibles",
    allPages: "Todas las páginas",
    noPageAccess: "Sin permisos configurados",
    noPermission: "No tienes permiso para ver esta página",
    fullName: "Nombre",
    staffUsername: "Usuario",
    technicianPhone: "Tel.",
    technicianColor: "Color",
    newPassword: "Contraseña",
    keepPassword: "Dejar vacío para mantener contraseña",
    today: "Hoy",
    yesterday: "Ayer",
    dayBeforeYesterday: "Anteayer",
    last7Days: "7 días",
    lastMonth: "1 mes",
    last14Days: "14 días",
    week: "Esta semana",
    month: "Este mes",
    year: "Este año",
    customRange: "Fechas personalizadas",
    quickDateRange: "Fecha rápida",
    startDate: "Fecha inicio",
    endDate: "Fecha fin",
    datePlaceholder: "dd/mm/aaaa",
    monthRevenue: "Facturación",
    revenueTrend: "Evolución de facturación",
    trendDaily: "Día",
    trendWeekly: "Semana",
    trendMonthly: "Mes",
    trendMetricAmount: "Importe",
    trendMetricOrders: "Órdenes",
    trendMetricBoth: "Ambos",
    repairCount: "Reparaciones",
    warrantyCount: "Garantías",
    orderCount: "Órdenes",
    orders: "órdenes",
    unpaidAmount: "Pendiente de cobro",
    receivedAmount: "Cobrado",
    repairAmount: "Importe reparación",
    financeTitle: "Resumen de caja",
    dailyBusiness: "Operación diaria",
    dailyCollected: "Cobrado hoy",
    dailyDepositCollected: "Depósito",
    dailyFinalCollected: "Pago final",
    dailyOrders: "Órdenes hoy",
    dailyUnpaid: "Pendiente hoy",
    dailyCost: "Coste hoy",
    dailyProfit: "Beneficio hoy",
    dailyPaymentCount: "Cobros hoy",
    financeReceivable: "A cobrar",
    financeReceived: "Cobrado",
    financeCost: "Coste",
    financeProfit: "Beneficio",
    paymentCount: "Cobros",
    paymentRecords: "Movimientos de cobro",
    unpaidOrders: "Órdenes pendientes",
    paidAmount: "Cobrado",
    paymentAmount: "Importe cobrado",
    paymentDate: "Fecha de cobro",
    paymentNote: "Nota",
    paymentHistory: "Historial de cobros",
    noPayments: "Sin cobros",
    finalPayment: "Pago final",
    depositPayment: "Depósito",
    paymentRecorded: "Cobro registrado",
    showingLimitedRows: "Para evitar lentitud, se muestran {shown} de {total}. Busca o reduce el rango de fechas.",
    paginationSummary: "Página {page} / {pages}, {total} registros",
    repairListSummary: "Total del filtro",
    filteredRepairOrders: "Reparaciones",
    filteredWarrantyOrders: "Garantías",
    technicianRangeStats: "Resumen por técnico",
    quickFindPrint: "Escanear código",
    scanShortcut: "Atajo para escanear",
    scanShortcutTitle: "Buscar orden",
    quickFindTitle: "Buscar por código de barras",
    quickFindHint: "Escanea el código de barras del ticket o escribe el número que aparece debajo para abrir la orden.",
    quickOrderInput: "Escanea el código o escribe el número",
    scanGunHint: "Enfoca el código de barras del ticket. Con lector, al pulsar Enter se abre la orden.",
    globalScanOpen: "Orden abierta {ticket}",
    barcodeScanGuide: "Enfoca el código de barras del ticket",
    startCamera: "Abrir cámara",
    stopCamera: "Cerrar cámara",
    cameraUnsupported: "Este navegador no reconoce códigos directamente. Usa un lector o escribe el número.",
    cameraError: "No se pudo abrir la cámara. Revisa los permisos del navegador.",
    openOrder: "Abrir orden",
    exactMatchOpen: "Orden encontrada, abriendo.",
    noOrderFound: "No se encontró la orden",
    technicianPerformance: "Rendimiento por técnico",
    technicianRepairOrders: "Reparaciones",
    technicianWarrantyOrders: "Garantías",
    technicianOpenOrders: "Sin terminar",
    technicianTodayProfit: "Beneficio hoy",
    technicianRepairRevenue: "Importe reparación",
    technicianRepairProfit: "Beneficio reparación",
    technicianWarrantyLoss: "Pérdida garantía",
    technicianOrders: "Órdenes del técnico",
    backToTechnicians: "Volver a técnicos",
    assignedTechnician: "Técnico",
    unassignedTechnician: "Sin asignar",
    historicalTechnician: "Histórico",
    topModels: "Modelos más frecuentes",
    topModelsChart: "Gráfico de modelos",
    topBrands: "Marcas más frecuentes",
    topServices: "Servicios más frecuentes",
    statusDistribution: "Distribución de estados",
    languageTab: "Idioma",
    printSettings: "Impresión",
    otherSettings: "Otros",
    terms: "Condiciones",
    businessInfo: "Datos del negocio",
    customerAccess: "Acceso del cliente",
    printLanguage: "Idioma de impresión",
    defaultWarrantyDuration: "Días de garantía por defecto",
    termsTemplates: "Plantillas de condiciones",
    shopName: "Nombre del negocio",
    shopAddress: "Dirección del negocio",
    shopTaxId: "CIF / NIF",
    publicBaseUrl: "URL pública de seguimiento",
    publicBaseUrlPlaceholder: "https://example.com o http://192.168.1.64:3000",
    whatsappTemplate: "Mensaje WhatsApp seguimiento",
    whatsappTemplatePlaceholder: "Usa {name}, {shop}, {url}, {ticket}, {device}, {status}",
    contactPhone: "Teléfono de contacto",
    taxRate: "IVA",
    hideIssuer: "No imprimir emisor",
    reservationTerms: "Condiciones de reserva",
    repairTerms: "Condiciones de reparación",
    warrantyTerms: "Condiciones de garantía",
    settingsSaved: "Ajustes guardados",
    exportJson: "Exportar JSON",
    downloadCurrentBackup: "Descargar copia actual",
    uploadBackupFile: "Subir copia",
    createBackupNow: "Crear copia ahora",
    backupHistory: "Historial de copias",
    backupAutoHint: "El sistema guarda una copia automática la primera vez que se guardan datos cada día.",
    backupManualHint: "También puedes crear una copia manual y descargarla como ZIP en tu ordenador.",
    backupCreated: "Copia creada",
    backupRestored: "Copia restaurada",
    backupDownloaded: "Descarga iniciada",
    backupFileImported: "Archivo de copia importado",
    externalHistoryImport: "Importar histórico externo",
    externalHistoryImportHint: "Importa JSON externos como Reparacionmovil.Es. Antes de importar se crea una copia de seguridad y se fusiona como órdenes históricas.",
    externalHistoryFile: "Archivo JSON externo",
    amountKeepStartDate: "Fecha inicial para conservar importes",
    amountKeepEndDate: "Fecha final para conservar importes",
    importExternalHistory: "Importar histórico externo",
    externalHistoryNoFile: "Selecciona primero un JSON histórico externo",
    externalHistoryImported: "Histórico importado: {added} nuevas, {skipped} omitidas, {zeroed} con importe a cero",
    externalHistoryProgressUploading: "Subiendo archivo",
    externalHistoryProgressProcessing: "Analizando y guardando en la base de datos. Puede tardar unos minutos.",
    externalHistoryProgressRefreshing: "Actualizando datos de la página",
    externalHistoryProgressDone: "Importación completada",
    invalidBackupFile: "Archivo de copia no válido",
    restoreBackup: "Restaurar",
    downloadBackup: "Descargar",
    backupKindAuto: "Auto",
    backupKindManual: "Manual",
    backupKindSafety: "Seguridad",
    backupEmpty: "Todavía no hay copias. Pulsa “Crear copia ahora”.",
    backupCounts: "{clients} clientes / {repairs} órdenes",
    confirmRestoreBackup: "¿Restaurar esta copia? Antes se guardará una copia de seguridad.",
    advancedJsonImport: "Importación avanzada",
    importJson: "Importar JSON",
    importLocalStorage: "Importar localStorage anterior",
    backupPlaceholder: "El JSON exportado aparecerá aquí. También puedes pegar un JSON para importarlo.",
    backupExported: "Copia exportada",
    pasteJsonFirst: "Pega primero el JSON",
    invalidBackup: "JSON de copia no válido",
    backupImported: "Copia importada",
    noOldData: "No hay datos antiguos en este navegador",
    importedRepairs: "{count} reparaciones importadas",
    publicStatusTitle: "Estado de reparación",
    publicNotFound: "No se encontró esta reparación.",
    updatedAt: "Actualizado",
    publicHint: "Para cualquier consulta, contacta con la tienda e indica el número de ticket.",
    receiptTitle: "Ticket repuestomovil",
    a4Title: "Hoja de reparación repuestomovil",
    repairDocTitle: "Hoja de reparación",
    reservationDocTitle: "Hoja de reserva",
    warrantyDocTitle: "Hoja de garantía",
    clientSection: "CLIENTE",
    repairSection: "REPARACIÓN",
    ticketBarcode: "Código de ticket",
    progressQr: "QR seguimiento",
    scanProgress: "Escanea para consultar el estado",
    imeiSn: "IMEI / SN",
    passwordPrint: "Contraseña",
    printProblem: "Fallos",
    taxableBase: "Base imponible",
    taxQuota: "Cuota IVA",
    device: "Dispositivo",
    date: "Fecha",
    monthLabel: "meses",
    dayLabel: "días",
    photos: "Fotos",
    signature: "Firma",
    acceptedTerms: "EL CLIENTE HA LEÍDO Y ACEPTADO LAS CONDICIONES",
    acceptedTermsCompact: "CLIENTE ACEPTA LAS CONDICIONES",
    customerSignature: "FIRMA DEL CLIENTE",
    pickupSignature: "RECOGIDO",
    shopSignature: "FIRMA / SELLO ESTABLECIMIENTO",
    progress: "Seguimiento"
  }
};

function getLang(settings) {
  return settings?.uiLanguage || settings?.printLanguage || "zh";
}

function makeT(lang) {
  const dict = uiText[lang] || uiText.zh;
  return (key, vars = {}) => {
    const value = dict[key] || uiText.zh[key] || key;
    return Object.entries(vars).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)), value);
  };
}

function StatusPill({ status, lang = "zh" }) {
  return (
    <span className={`status-pill ${statusClassMap[status] || "status-reserva"}`}>
      {statusLabel(status, lang)}
    </span>
  );
}

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

let activeShopSlug = "default";

function configureShopContext(shopSlug) {
  activeShopSlug = shopSlug || "default";
}

export default function AppPage({ shopSlug = "default", shopName = "", shopId = "" }) {
  configureShopContext(shopSlug);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState(seedData);
  const [route, setRoute] = useState("/login");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toastText, setToastText] = useState("");
  const [filters, setFilters] = useState(() => {
    const initialRepairRange = repairDateRange("today");
    return {
    repairsSearch: "",
    repairsStatus: "",
    repairsOrderType: "",
    repairsStartDate: initialRepairRange.start,
    repairsEndDate: initialRepairRange.end,
    repairsDatePreset: "today",
    repairsPage: 1,
    clientsSearch: "",
    clientsFilter: "all",
    clientsSort: "latest",
    clientsPage: 1,
    clientOrdersStartDate: "",
    clientOrdersEndDate: "",
    clientOrdersPage: 1,
    brandsSearch: "",
    partsSearch: "",
    partsCategory: "",
    partsPage: 1,
    servicesSearch: "",
    servicesCategory: "",
    servicesPage: 1,
    attributesSearch: "",
    attributesPage: 1,
    staffSearch: "",
    staffPage: 1,
    techniciansSearch: "",
    techniciansPage: 1,
    technicianOrdersStartDate: "",
    technicianOrdersEndDate: "",
    technicianOrdersPage: 1,
    reportPreset: "month",
    reportStart: "",
    reportEnd: "",
    reportTrendGranularity: "day",
    reportTrendMetric: "both",
    financePreset: "month",
    financeStart: "",
    financeEnd: "",
    financeSearch: "",
    financePaymentsPage: 1,
    financeUnpaidPage: 1
    };
  });
  const [currentBrandId, setCurrentBrandId] = useState("");
  const [repairDraft, setRepairDraft] = useState(null);
  const [catalogTab, setCatalogTab] = useState("services");
  const [theme, setTheme] = useState("light");
  const [scanSearchOpen, setScanSearchOpen] = useState(false);
  const [scanSearchQuery, setScanSearchQuery] = useState("");
  const [scanSearchMessage, setScanSearchMessage] = useState("");
  const dataRef = useRef(data);
  const routeRef = useRef(route);
  const unsavedGuardRef = useRef(null);
  const [repairTopbarSave, setRepairTopbarSave] = useState(null);
  const restoringHashRef = useRef(false);
  const preservingRepairDraftRouteRef = useRef("");
  const confirmedDataRef = useRef(data);
  const saveQueueRef = useRef(Promise.resolve());
  const lang = getLang(data.settings);
  const t = useMemo(() => makeT(lang), [lang]);
  const changeTheme = (nextTheme) => {
    const normalized = nextTheme === "dark" ? "dark" : "light";
    setTheme(normalized);
    applyThemePreference(normalized);
  };

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const initialTheme = readThemePreference();
    setTheme(initialTheme);
    applyThemePreference(initialTheme);

    const initialRoute = window.location.hash.replace(/^#/, "") || "/login";
    routeRef.current = initialRoute;
    setRoute(initialRoute);
    setMounted(true);
    bootstrap();

    const onHash = () => {
      const nextRoute = window.location.hash.replace(/^#/, "") || "/login";
      const previousRoute = routeRef.current || "/login";
      if (nextRoute === previousRoute) return;
      if (restoringHashRef.current) {
        restoringHashRef.current = false;
        routeRef.current = nextRoute;
        setRoute(nextRoute);
        return;
      }
      if (nextRoute !== previousRoute && hasUnsavedDetailChanges()) {
        const shouldLeave = window.confirm(makeT(getLang(dataRef.current.settings))("unsavedChangesConfirm"));
        if (!shouldLeave) {
          restoringHashRef.current = true;
          window.location.hash = previousRoute;
          return;
        }
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
      setModal(null);
      if (preservingRepairDraftRouteRef.current === nextRoute) {
        preservingRepairDraftRouteRef.current = "";
      } else {
        setRepairDraft(null);
      }
      unsavedGuardRef.current = null;
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedDetailChanges()) return undefined;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!session && route !== "/login") navigate("/login");
    if (session && route === "/login") navigate("/dashboard/repairs");
    if (session && route !== "/login" && !canAccessRoute(session, route)) navigate(firstAllowedRoute(session));
  }, [session, route, mounted]);

  useEffect(() => {
    if (!session) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || !isScanSearchShortcut(event, dataRef.current.settings)) return;
      event.preventDefault();
      event.stopPropagation();
      setScanSearchQuery("");
      setScanSearchMessage("");
      setScanSearchOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [session]);

  function hasUnsavedDetailChanges() {
    return Boolean(unsavedGuardRef.current?.isDirty?.());
  }

  function registerUnsavedGuard(guard) {
    unsavedGuardRef.current = guard;
    return () => {
      if (unsavedGuardRef.current === guard) unsavedGuardRef.current = null;
    };
  }

  const registerRepairTopbar = useCallback((actions) => {
    setRepairTopbarSave(actions || null);
    return () => {
      setRepairTopbarSave((current) => (current === actions ? null : current));
    };
  }, []);

  function navigate(nextRoute, options = {}) {
    if (nextRoute === routeRef.current) return true;
    if (!options.force && hasUnsavedDetailChanges()) {
      const shouldLeave = window.confirm(t("unsavedChangesConfirm"));
      if (!shouldLeave) return false;
    }
    unsavedGuardRef.current = null;
    setRepairTopbarSave(null);
    if (options.repairDraft) {
      preservingRepairDraftRouteRef.current = nextRoute;
      setRepairDraft(options.repairDraft);
    } else if (options.preserveRepairDraft) {
      preservingRepairDraftRouteRef.current = nextRoute;
    } else {
      preservingRepairDraftRouteRef.current = "";
      setRepairDraft(null);
    }
    window.location.hash = nextRoute;
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    return true;
  }

  function openScanSearchTicket(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
      setScanSearchMessage(t("noOrderFound"));
      return false;
    }
    const repair = findRepairByTicket(dataRef.current.repairs || [], value);
    if (!repair) {
      setScanSearchQuery(scannedTicketValue(value) || value);
      setScanSearchMessage(t("noOrderFound"));
      return false;
    }
    const opened = navigate(`/dashboard/repairs/${repair.id}`);
    if (!opened) return false;
    setScanSearchOpen(false);
    setScanSearchQuery("");
    setScanSearchMessage("");
    showToast(t("globalScanOpen", { ticket: repair.ticket || scannedTicketValue(value) || value }));
    return true;
  }

  function openGlobalScanDialog() {
    setScanSearchQuery("");
    setScanSearchMessage("");
    setScanSearchOpen(true);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      const me = await apiGet("/api/auth/me");
      if (me.user && shopId && me.user.shopId !== shopId) {
        await apiJson("/api/auth/logout", "POST", {}).catch(() => {});
        setSession(null);
        return;
      }
      setSession(me.user);
      if (!me.user) return;
      const nextData = await apiGet("/api/bootstrap");
      const normalized = normalizeData(nextData);
      confirmedDataRef.current = normalized;
      dataRef.current = normalized;
      setData(normalized);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveData(updater) {
    const optimistic = typeof updater === "function" ? updater(dataRef.current) : updater;
    const queuedPayload = optimistic;
    dataRef.current = optimistic;
    setData(optimistic);

    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      const base = confirmedDataRef.current;
      const payload = { ...queuedPayload, _revision: base._revision || "", _settingsUpdatedAt: base._settingsUpdatedAt || "" };
      try {
        const saved = await apiJson("/api/bootstrap", "PUT", payload);
        const normalized = normalizeData(saved);
        confirmedDataRef.current = normalized;
        dataRef.current = normalized;
        setData(normalized);
        return true;
      } catch (error) {
        dataRef.current = confirmedDataRef.current;
        setData(confirmedDataRef.current);
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });

    return saveQueueRef.current;
  }

  async function saveClientRecord(client) {
    const optimistic = { ...client, id: client.id || id() };
    dataRef.current = {
      ...dataRef.current,
      clients: upsertRow(dataRef.current.clients || [], optimistic)
    };
    setData(dataRef.current);
    try {
      const result = await apiJson("/api/clients", "POST", optimistic);
      const saved = result.client || result;
      const revision = revisionFromSave(dataRef.current._revision, result);
      dataRef.current = {
        ...dataRef.current,
        _revision: revision,
        clients: upsertRow(dataRef.current.clients || [], saved)
      };
      confirmedDataRef.current = {
        ...confirmedDataRef.current,
        _revision: revisionFromSave(confirmedDataRef.current._revision, result),
        clients: upsertRow(confirmedDataRef.current.clients || [], saved)
      };
      setData(dataRef.current);
      return true;
    } catch (error) {
      dataRef.current = confirmedDataRef.current;
      setData(confirmedDataRef.current);
      showToast(error.message || t("saveFailed"));
      return false;
    }
  }

  async function deleteClientRecord(clientId) {
    const optimistic = {
      ...dataRef.current,
      clients: (dataRef.current.clients || []).filter((client) => client.id !== clientId)
    };
    dataRef.current = optimistic;
    setData(optimistic);
    try {
      const result = await apiJson("/api/clients", "DELETE", { id: clientId });
      const nextData = {
        ...dataRef.current,
        _revision: revisionFromSave(dataRef.current._revision, result),
        clients: (dataRef.current.clients || []).filter((client) => client.id !== clientId)
      };
      const nextConfirmed = {
        ...confirmedDataRef.current,
        _revision: revisionFromSave(confirmedDataRef.current._revision, result),
        clients: (confirmedDataRef.current.clients || []).filter((client) => client.id !== clientId)
      };
      confirmedDataRef.current = nextConfirmed;
      dataRef.current = nextData;
      setData(nextData);
      return true;
    } catch (error) {
      dataRef.current = confirmedDataRef.current;
      setData(confirmedDataRef.current);
      showToast(error.message || t("saveFailed"));
      return false;
    }
  }

  async function saveNonRepairResource(resource, updater) {
    const optimistic = typeof updater === "function" ? updater(dataRef.current) : updater;
    dataRef.current = optimistic;
    setData(optimistic);

    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      try {
        const body = nonRepairResourcePayload(resource, optimistic);
        const saved = await apiJson(`/api/${resource}`, "POST", body);
        const nextData = mergeNonRepairSaveResult(dataRef.current, saved);
        const nextConfirmed = mergeNonRepairSaveResult(confirmedDataRef.current, saved);
        confirmedDataRef.current = nextConfirmed;
        dataRef.current = nextData;
        setData(nextData);
        return true;
      } catch (error) {
        dataRef.current = confirmedDataRef.current;
        setData(confirmedDataRef.current);
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });

    return saveQueueRef.current;
  }

  async function saveRepairRecord(nextRepair, nextClient = null) {
    if (!nextRepair?.id) return false;
    const optimistic = mergeRepairAndClient(dataRef.current, normalizeRepairDraft(nextRepair), nextClient);
    dataRef.current = optimistic;
    setData(optimistic);

    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      try {
        const saved = await apiJson(`/api/repairs/${encodeURIComponent(nextRepair.id)}`, "PUT", { repair: nextRepair, client: nextClient });
        const savedRepair = normalizeRepairDraft(saved.repair || nextRepair);
        const nextData = mergeRepairAndClient(dataRef.current, savedRepair, saved.client || nextClient, saved._revision);
        const nextConfirmed = mergeRepairAndClient(confirmedDataRef.current, savedRepair, saved.client || nextClient, saved._revision);
        confirmedDataRef.current = nextConfirmed;
        dataRef.current = nextData;
        setData(nextData);
        return { repair: savedRepair, client: saved.client || nextClient };
      } catch (error) {
        dataRef.current = confirmedDataRef.current;
        setData(confirmedDataRef.current);
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });

    return saveQueueRef.current;
  }

  async function deleteRepairRecord(repairId) {
    if (!repairId) return false;
    const optimistic = removeRepairFromData(dataRef.current, repairId);
    dataRef.current = optimistic;
    setData(optimistic);

    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      try {
        const saved = await apiJson(`/api/repairs/${encodeURIComponent(repairId)}`, "DELETE", {});
        const nextData = removeRepairFromData(dataRef.current, repairId, saved._revision);
        const nextConfirmed = removeRepairFromData(confirmedDataRef.current, repairId, saved._revision);
        confirmedDataRef.current = nextConfirmed;
        dataRef.current = nextData;
        setData(nextData);
        return true;
      } catch (error) {
        dataRef.current = confirmedDataRef.current;
        setData(confirmedDataRef.current);
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });

    return saveQueueRef.current;
  }

  async function saveStaffRecord(staffPayload) {
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      try {
        const saved = await apiJson("/api/staff", "POST", staffPayload);
        applyStaffSaveResult(saved);
        return true;
      } catch (error) {
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });
    return saveQueueRef.current;
  }

  async function deleteStaffRecord(staffId) {
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      try {
        const saved = await apiJson("/api/staff", "DELETE", { id: staffId });
        applyStaffSaveResult(saved);
        return true;
      } catch (error) {
        showToast(error.message || t("saveFailed"));
        return false;
      }
    });
    return saveQueueRef.current;
  }

  function applyStaffSaveResult(saved = {}) {
    const nextUsers = Array.isArray(saved.users) ? saved.users : dataRef.current.users;
    const nextData = normalizeData({ ...dataRef.current, users: nextUsers, _revision: revisionFromSave(dataRef.current._revision, saved) });
    const nextConfirmed = normalizeData({ ...confirmedDataRef.current, users: nextUsers, _revision: revisionFromSave(confirmedDataRef.current._revision, saved) });
    confirmedDataRef.current = nextConfirmed;
    dataRef.current = nextData;
    setData(nextData);
    if (saved.currentUser) {
      setSession((current) => current?.id === saved.currentUser.id ? { ...current, ...saved.currentUser } : current);
    }
  }

  async function saveSettingsOnly(nextSettings) {
    try {
      const result = await apiJson("/api/settings", "POST", nextSettings);
      const settings = result.settings || nextSettings || {};
      const settingsUpdatedAt = result._settingsUpdatedAt || new Date().toISOString();
      const nextData = {
        ...dataRef.current,
        settings,
        _settingsUpdatedAt: settingsUpdatedAt,
        _revision: revisionFromSave(dataRef.current._revision, result) || replaceSettingsRevision(dataRef.current._revision, settingsUpdatedAt)
      };
      const nextConfirmed = {
        ...confirmedDataRef.current,
        settings,
        _settingsUpdatedAt: settingsUpdatedAt,
        _revision: revisionFromSave(confirmedDataRef.current._revision, result) || replaceSettingsRevision(confirmedDataRef.current._revision, settingsUpdatedAt)
      };
      confirmedDataRef.current = nextConfirmed;
      dataRef.current = nextData;
      setData(nextData);
      return true;
    } catch (error) {
      showToast(error.message || t("saveFailed"));
      return false;
    }
  }

  function showToast(message) {
    setToastText(message);
    window.setTimeout(() => setToastText(""), 1400);
  }

  if (!mounted || loading) return null;

  if (!session) {
    return <Login shopName={shopName} theme={theme} onThemeChange={changeTheme} onLogin={async (username, password) => {
      const result = await apiJson("/api/auth/login", "POST", { username, password });
      const nextData = await apiGet("/api/bootstrap");
      const normalized = normalizeData(nextData);
      confirmedDataRef.current = normalized;
      dataRef.current = normalized;
      setData(normalized);
      setSession(result.user);
      navigate("/dashboard/repairs");
    }} />;
  }

  const currentPath = route.split("?")[0];
  const showTopbarScanButton = Boolean(session) && currentPath.startsWith("/dashboard");

  return (
    <div className="app-shell">
      <Sidebar route={route} user={session} navigate={navigate} lang={lang} t={t} theme={theme} onThemeChange={changeTheme} onLanguageChange={(nextLang) => {
        saveSettingsOnly({ ...(dataRef.current.settings || {}), uiLanguage: nextLang, printLanguage: nextLang });
      }} onLogout={async () => {
        if (hasUnsavedDetailChanges() && !window.confirm(t("unsavedChangesConfirm"))) return;
        unsavedGuardRef.current = null;
        setRepairTopbarSave(null);
        setRepairDraft(null);
        await apiJson("/api/auth/logout", "POST", {});
        setSession(null);
        navigate("/login", { force: true });
      }} />
      <main className="main">
        <header className="topbar">
          <h1>{pageTitle(route, t)}</h1>
          {showTopbarScanButton ? (
            <div className="topbar-leading-actions">
              <Button variant="outline" type="button" onClick={openGlobalScanDialog}><ScanLine {...ICON_SM} /> {t("scanOrder")}</Button>
            </div>
          ) : null}
          <TopbarActions
            route={route}
            data={data}
            saveData={saveData}
            saveRepairRecord={saveRepairRecord}
            deleteRepairRecord={deleteRepairRecord}
            navigate={navigate}
            repairDraft={repairDraft}
            repairTopbarSave={repairTopbarSave}
            toast={showToast}
            lang={lang}
            t={t}
          />
        </header>
        <RouteView
          route={route}
          data={data}
          saveData={saveData}
          saveClientRecord={saveClientRecord}
          deleteClientRecord={deleteClientRecord}
          saveRepairRecord={saveRepairRecord}
          deleteRepairRecord={deleteRepairRecord}
          saveStaffRecord={saveStaffRecord}
          deleteStaffRecord={deleteStaffRecord}
          navigate={navigate}
          filters={filters}
          setFilters={setFilters}
          modal={modal}
          setModal={setModal}
          currentBrandId={currentBrandId}
          setCurrentBrandId={setCurrentBrandId}
          repairDraft={repairDraft}
          setRepairDraft={setRepairDraft}
          catalogTab={catalogTab}
          setCatalogTab={setCatalogTab}
          registerUnsavedGuard={registerUnsavedGuard}
          registerRepairTopbar={registerRepairTopbar}
          saveSettingsOnly={saveSettingsOnly}
          saveNonRepairResource={saveNonRepairResource}
          toast={showToast}
          session={session}
          bootstrap={bootstrap}
          lang={lang}
          t={t}
          openScanSearch={openGlobalScanDialog}
        />
      </main>
      <ModalHost modal={modal} setModal={setModal} data={data} saveData={saveData} saveClientRecord={saveClientRecord} saveStaffRecord={saveStaffRecord} saveNonRepairResource={saveNonRepairResource} toast={showToast} lang={lang} t={t} />
      <ScanSearchDialog
        open={scanSearchOpen}
        onOpenChange={(open) => {
          setScanSearchOpen(open);
          if (!open) {
            setScanSearchQuery("");
            setScanSearchMessage("");
          }
        }}
        query={scanSearchQuery}
        setQuery={setScanSearchQuery}
        message={scanSearchMessage}
        setMessage={setScanSearchMessage}
        onSubmit={openScanSearchTicket}
        t={t}
      />
      {toastText ? <div className="toast"><CheckCircle2 {...ICON_SM} /> {toastText}</div> : null}
    </div>
  );
}

function Login({ shopName, onLogin, theme, onThemeChange }) {
  const [lang, setLang] = useState("zh");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const t = makeT(lang);
  const displayName = String(shopName || "").trim() || APP_DISPLAY_NAME;
  return (
    <main className="login-page">
      <div className="login-logo">{displayName}</div>
      <Card className="login-card">
        <CardContent>
          <div className="login-tools">
            <ThemeToggleButton theme={theme} onThemeChange={onThemeChange} t={t} compact />
            <Select value={lang} onChange={(event) => setLang(event.target.value)}>
              {languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
          </div>
          <h1 className="login-title">{displayName}</h1>
          <form onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              await onLogin(username, password);
            } catch (error) {
              setError(error.message || t("loginError"));
            }
          }}>
            <Field><FieldIcon><User {...ICON} /></FieldIcon><Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t("username")} autoComplete="username" /></Field>
            <div style={{ height: 12 }} />
            <Field><FieldIcon><Lock {...ICON} /></FieldIcon><Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("password")} type="password" autoComplete="current-password" /></Field>
            <div className="login-error">{error}</div>
            <TextLink className="forgot" href="#/login">{t("forgotPassword")}</TextLink>
            <Button style={{ width: "100%" }} type="submit">{t("login")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function ThemeToggleButton({ theme, onThemeChange, t, compact = false, className = "" }) {
  const isDark = theme === "dark";
  const label = isDark ? t("themeLight") : t("themeDark");
  const classes = ["theme-toggle", compact ? "theme-toggle-compact" : "", className].filter(Boolean).join(" ");

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      className={classes}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={() => onThemeChange?.(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun {...ICON_SM} /> : <Moon {...ICON_SM} />}
      {compact ? null : <span>{label}</span>}
    </Button>
  );
}

function TopbarActions({ route, data, saveData, saveRepairRecord, deleteRepairRecord, navigate, repairDraft, repairTopbarSave, toast, lang, t }) {
  const path = route.split("?")[0];
  const renderRepairSaveButton = () => repairTopbarSave ? (
    <Button
      className="repair-save-topbar-button"
      disabled={repairTopbarSave.disabled}
      title={repairTopbarSave.title || ""}
      onClick={() => repairTopbarSave.onSave?.()}
    >
      {repairTopbarSave.label || t("save")}
    </Button>
  ) : null;
  if (path === "/dashboard/repairs/new" || path === "/dashboard/warranties/new") {
    return repairTopbarSave ? <div className="topbar-actions">{renderRepairSaveButton()}</div> : null;
  }
  if (
    (path.startsWith("/dashboard/repairs/") && path !== "/dashboard/repairs/new")
    || (path.startsWith("/dashboard/warranties/") && path !== "/dashboard/warranties/new")
  ) {
    const repairId = path.split("/").pop();
    const existing = data.repairs.find((repair) => repair.id === repairId);
    if (!existing) return null;
    const draft = normalizeRepairDraft(repairDraft?.id === existing.id ? repairDraft : existing);
    const selectedClient = clientById(data, draft.clientId);
    const isWarranty = (existing.orderType || "repair") === "warranty";
    const subtotal = repairAmount(draft);
    const total = chargeAmount(draft);
    const due = Math.max(0, total - repairPaidAmount(draft));
    const publicUrl = draft.publicToken ? buildPublicStatusUrl(data.settings, draft.publicToken) : "";
    const linkedWarrantyOrders = isWarranty ? [] : data.repairs.filter((repair) => repair.orderType === "warranty" && repair.sourceRepairId === existing.id);
    const orderLocked = isOrderLocked(draft, data.settings);
    const warrantyPrint = shouldPrintWarrantyDocument(draft);
    const createNewOrder = () => {
      navigate("/dashboard/repairs/new", { repairDraft: newRepairDraft() });
    };
    const createSameClientOrder = () => {
      const nextDraft = {
        ...newRepairDraft(),
        clientId: draft.clientId || selectedClient.id || "",
        clientName: draft.clientName || selectedClient.name || "",
        clientLevel: normalizeClientLevel(draft.clientLevel || selectedClient.level),
        docType: draft.docType || selectedClient.docType || "DNI",
        identity: draft.identity || selectedClient.identity || "",
        email: draft.email || selectedClient.email || "",
        phone: draft.phone || selectedClient.phone || "",
        address: draft.address || selectedClient.address || ""
      };
      navigate("/dashboard/repairs/new", { repairDraft: nextDraft });
    };
    const createWarrantyOrder = () => {
      const nextDraft = {
        ...newRepairDraft(),
        clientId: draft.clientId || selectedClient.id || "",
        clientName: draft.clientName || selectedClient.name || "",
        clientLevel: normalizeClientLevel(draft.clientLevel || selectedClient.level),
        docType: draft.docType || selectedClient.docType || "DNI",
        identity: draft.identity || selectedClient.identity || "",
        email: draft.email || selectedClient.email || "",
        phone: draft.phone || selectedClient.phone || "",
        address: draft.address || selectedClient.address || "",
        brand: draft.brand || "",
        model: draft.model || "",
        properties: draft.properties || "",
        imei: draft.imei || "",
        technicianId: draft.technicianId || "",
        technicianName: draft.technicianName || "",
        status: "预定",
        orderType: "warranty",
        sourceRepairId: existing.id,
        warrantyChargeable: false
      };
      navigate("/dashboard/warranties/new", { repairDraft: nextDraft });
    };
    const deleteRepair = async () => {
      if (orderLocked) return toast(t("orderLocked"));
      if (linkedWarrantyOrders.length) return toast(t("cannotDeleteRepairWithWarranty"));
      if (!confirm(isWarranty ? t("confirmDeleteWarranty") : t("confirmDeleteRepair"))) return;
      const ok = await deleteRepairRecord(existing.id);
      if (!ok) return;
      toast(isWarranty ? t("warrantyDeleted") : t("repairDeleted"));
      navigate(isWarranty ? "/dashboard/warranties" : "/dashboard/repairs", { force: true });
    };
    return (
      <div className="topbar-actions">
        <Button variant="outline" type="button" onClick={createNewOrder}><Plus {...ICON_SM} /> {t("newOrderButton")}</Button>
        <Button variant="outline" type="button" onClick={createSameClientOrder}><Plus {...ICON_SM} /> {t("newOrderSameClient")}</Button>
        {!isWarranty ? <Button variant="outline" type="button" onClick={createWarrantyOrder}><ShieldCheck {...ICON_SM} /> {t("addWarrantyOrder")}</Button> : null}
        <Button variant="outline" onClick={() => printRepair("receipt", draft, selectedClient, { subtotal, total, due, qrDataUrl: "", publicUrl, settings: data.settings })}>{warrantyPrint ? t("printWarrantyReceipt") : t("printReceipt")}</Button>
        <Button variant="outline" onClick={() => printRepair("a4", draft, selectedClient, { subtotal, total, due, qrDataUrl: "", publicUrl, settings: data.settings })}>{warrantyPrint ? t("printWarrantyA4") : t("printA4")}</Button>
        {renderRepairSaveButton()}
        <Button variant="danger" disabled={orderLocked} title={orderLocked ? t("orderLockedHint") : ""} onClick={deleteRepair}><Trash2 {...ICON_SM} /> {t("delete")}</Button>
      </div>
    );
  }
  return null;
}

function Sidebar({ route, user, navigate, lang, t, onLanguageChange, onLogout, theme, onThemeChange }) {
  const mobileMenuRef = useRef(null);
  const go = (nextRoute) => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
    navigate(nextRoute);
  };
  const categoryActive = ["/dashboard/categories", "/dashboard/products", "/dashboard/modules", "/dashboard/services", "/dashboard/attributes"].includes(route);
  const canSee = (key) => canAccessPage(user, key);
  const categoryVisible = ["categories", "modules", "services", "attributes"].some(canSee);
  const productVisible = canSee("services") || canSee("modules");
  const mobileMenuItems = [
    { key: "repairs", route: "/dashboard/quick-print", icon: <ScanLine {...ICON} />, label: t("quickFindPrint") },
    { key: "repairs", route: "/dashboard/warranties", icon: <ShieldCheck {...ICON} />, label: t("warrantyOrders") },
    { key: "categories", route: "/dashboard/categories", icon: <Tag {...ICON} />, label: t("brandModel") },
    ...(productVisible ? [{ route: "/dashboard/products", icon: <Package {...ICON} />, label: t("productCatalog") }] : []),
    { key: "attributes", route: "/dashboard/attributes", icon: <SlidersHorizontal {...ICON} />, label: t("attributes") },
    ...(user?.isAdmin ? [{ route: "/dashboard/staff", icon: <IdCard {...ICON} />, label: t("staff") }] : []),
    { key: "technicians", route: "/dashboard/technicians", icon: <Wrench {...ICON} />, label: t("technicians") },
    { key: "reports", route: "/dashboard/reports", icon: <BarChart3 {...ICON} />, label: t("reports") },
    { key: "finance", route: "/dashboard/finance", icon: <WalletCards {...ICON} />, label: t("finance") },
    { key: "settings", route: "/dashboard/settings", icon: <Settings {...ICON} />, label: t("settings") },
    { key: "backup", route: "/dashboard/backup", icon: <Database {...ICON} />, label: t("backup") }
  ].filter((item) => !item.key || canSee(item.key));
  return (
    <aside className="sidebar">
      <div className="brand-title"><Wrench {...ICON} /> {t("appTitle")}</div>
      <nav className="side-menu">
        <NavItem><User {...ICON} /><span>{user?.name || user?.username || t("userFallback")}</span></NavItem>
        {canSee("repairs") ? <SideLink active={route.startsWith("/dashboard/repairs")} onClick={() => go("/dashboard/repairs")} icon={<Wrench {...ICON} />} label={t("repairs")} dot /> : null}
        {canSee("repairs") ? <SideLink active={route.startsWith("/dashboard/warranties")} onClick={() => go("/dashboard/warranties")} icon={<ShieldCheck {...ICON} />} label={t("warrantyOrders")} /> : null}
        {canSee("clients") ? <SideLink className="mobile-bottom-secondary" active={route === "/dashboard/clients"} onClick={() => go("/dashboard/clients")} icon={<Users {...ICON} />} label={t("clients")} /> : null}
        {categoryVisible ? <NavItem><Tag {...ICON} /><span>{t("category")}</span><ChevronDown {...ICON_SM} style={{ marginLeft: "auto" }} /></NavItem> : null}
        {categoryVisible ? (
          <div className="side-sub">
            {canSee("categories") ? <SideLink active={route === "/dashboard/categories"} onClick={() => go("/dashboard/categories")} icon={<Tag {...ICON_SM} />} label={t("brandModel")} /> : null}
            {productVisible ? <SideLink active={route === "/dashboard/products" || route === "/dashboard/modules" || route === "/dashboard/services"} onClick={() => go("/dashboard/products")} icon={<Package {...ICON_SM} />} label={t("productCatalog")} /> : null}
            {canSee("attributes") ? <SideLink active={route === "/dashboard/attributes"} onClick={() => go("/dashboard/attributes")} icon={<SlidersHorizontal {...ICON_SM} />} label={t("attributes")} /> : null}
          </div>
        ) : null}
        {user?.isAdmin ? <SideLink active={route === "/dashboard/staff"} onClick={() => go("/dashboard/staff")} icon={<IdCard {...ICON} />} label={t("staff")} /> : null}
        {canSee("technicians") ? <SideLink active={route === "/dashboard/technicians"} onClick={() => go("/dashboard/technicians")} icon={<Wrench {...ICON} />} label={t("technicians")} /> : null}
        {canSee("reports") ? <SideLink active={route === "/dashboard/reports"} onClick={() => go("/dashboard/reports")} icon={<BarChart3 {...ICON} />} label={t("reports")} /> : null}
        {canSee("finance") ? <SideLink active={route === "/dashboard/finance"} onClick={() => go("/dashboard/finance")} icon={<WalletCards {...ICON} />} label={t("finance")} /> : null}
        {canSee("settings") ? <SideLink active={route === "/dashboard/settings"} onClick={() => go("/dashboard/settings")} icon={<Settings {...ICON} />} label={t("settings")} /> : null}
        {canSee("backup") ? <SideLink active={route === "/dashboard/backup"} onClick={() => go("/dashboard/backup")} icon={<Database {...ICON} />} label={t("backup")} /> : null}
        {canSee("reports") ? <SideLink mobileOnly active={route === "/dashboard/reports"} onClick={() => go("/dashboard/reports")} icon={<BarChart3 {...ICON} />} label={t("reports")} /> : null}
        {canSee("finance") ? <SideLink mobileOnly active={route === "/dashboard/finance"} onClick={() => go("/dashboard/finance")} icon={<WalletCards {...ICON} />} label={t("finance")} /> : null}
        {categoryVisible ? <SideLink className="mobile-bottom-secondary" mobileOnly active={categoryActive} onClick={() => go(firstAllowedCategoryRoute(user))} icon={<Tag {...ICON} />} label={t("category")} /> : null}
        <details ref={mobileMenuRef} className="mobile-menu-wrap">
          <NavItem as="summary" className="mobile-menu-trigger">
            <Menu {...ICON} /><span>{t("menu")}</span>
          </NavItem>
          <div className="mobile-menu-panel">
            <div className="mobile-menu-grid">
              {mobileMenuItems.map((item) => (
                <MobileMenuCard key={item.route} active={route === item.route} onClick={() => go(item.route)}>
                  {item.icon}<span>{item.label}</span>
                </MobileMenuCard>
              ))}
            </div>
            <div className="mobile-menu-footer">
              <Select value={lang} onChange={(event) => onLanguageChange(event.target.value)}>{languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
              <ThemeToggleButton theme={theme} onThemeChange={onThemeChange} t={t} compact />
              <Button variant="outline" onClick={onLogout}><LogOut {...ICON_SM} /> {t("logout")}</Button>
            </div>
          </div>
        </details>
      </nav>
      <div className="sidebar-bottom">
        <Select value={lang} onChange={(event) => onLanguageChange(event.target.value)}>{languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
        <ThemeToggleButton theme={theme} onThemeChange={onThemeChange} t={t} className="theme-toggle-wide" />
        <Button variant="outline" style={{ width: "100%" }} onClick={onLogout}><LogOut {...ICON_SM} /> {t("logout")}</Button>
        <TextLink className="small-link" href="#/dashboard/repairs">{t("changelog")}</TextLink>
      </div>
    </aside>
  );
}

function SideLink({ active, onClick, icon, label, dot, mobileOnly, className }) {
  return (
    <NavItem className={className} mobileOnly={mobileOnly} active={active} dot={dot} onClick={onClick}>
      {icon}<span>{label}</span>
    </NavItem>
  );
}

function RouteView(props) {
  const { route, session } = props;
  const path = route.split("?")[0];
  if (!canAccessRoute(session, route)) return <section className="page"><Empty>{props.t("noPermission")}</Empty></section>;
  if (route === "/dashboard/quick-print") return <QuickFindPage {...props} />;
  if (route === "/dashboard/clients") return <ClientsPage {...props} />;
  if (path.startsWith("/dashboard/clients/")) return <ClientOrdersPage {...props} clientId={decodeURIComponent(path.split("/").pop() || "")} />;
  if (route === "/dashboard/categories") return <CategoriesPage {...props} />;
  if (route === "/dashboard/products") return <ProductsPage {...props} />;
  if (route === "/dashboard/modules") return <CatalogPage {...props} type="parts" />;
  if (route === "/dashboard/services") return <CatalogPage {...props} type="services" />;
  if (route === "/dashboard/attributes") return <AttributesPage {...props} />;
  if (route === "/dashboard/staff") return session?.isAdmin ? <StaffPage {...props} /> : <RepairsPage {...props} />;
  if (route === "/dashboard/technicians") return <TechniciansPage {...props} />;
  if (path.startsWith("/dashboard/technicians/")) return <TechnicianOrdersPage {...props} technicianKey={decodeURIComponent(path.split("/").pop() || "")} />;
  if (path === "/dashboard/warranties/new") return <RepairForm {...props} />;
  if (path === "/dashboard/warranties") return <RepairsPage {...props} />;
  if (path.startsWith("/dashboard/warranties/")) return <RepairForm {...props} repairId={path.split("/").pop()} />;
  if (route === "/dashboard/reports") return <ReportsPage {...props} />;
  if (route === "/dashboard/finance") return <FinancePage {...props} />;
  if (route === "/dashboard/settings") return <SettingsPage {...props} />;
  if (route === "/dashboard/backup") return <BackupPage {...props} />;
  if (route === "/dashboard/repairs/new") return <RepairForm {...props} />;
  if (route.startsWith("/dashboard/repairs/")) return <RepairForm {...props} repairId={route.split("/").pop()} />;
  return <RepairsPage {...props} />;
}

function routePermissionKey(route) {
  const path = route.split("?")[0];
  if (path === "/dashboard/quick-print") return "repairs";
  if (path.startsWith("/dashboard/repairs")) return "repairs";
  if (path.startsWith("/dashboard/warranties")) return "repairs";
  if (path.startsWith("/dashboard/clients")) return "clients";
  if (path === "/dashboard/categories") return "categories";
  if (path === "/dashboard/modules") return "modules";
  if (path === "/dashboard/services") return "services";
  if (path === "/dashboard/products") return "products";
  if (path === "/dashboard/attributes") return "attributes";
  if (path.startsWith("/dashboard/technicians")) return "technicians";
  if (path === "/dashboard/reports") return "reports";
  if (path === "/dashboard/finance") return "finance";
  if (path === "/dashboard/settings") return "settings";
  if (path === "/dashboard/backup") return "backup";
  if (path === "/dashboard/staff") return "staff";
  return "repairs";
}

function canAccessRoute(user, route) {
  const key = routePermissionKey(route);
  if (key === "staff") return Boolean(user?.isAdmin);
  if (key === "products") return canAccessPage(user, "services") || canAccessPage(user, "modules");
  return canAccessPage(user, key);
}

function canAccessPage(user, key) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const permissions = normalizedPagePermissions(user);
  return permissions.includes(key);
}

function normalizedPagePermissions(user) {
  if (user?.isAdmin) return PAGE_PERMISSION_KEYS;
  const rawPermissions = Array.isArray(user?.pagePermissions) ? user.pagePermissions : [];
  const permissions = rawPermissions.map((key) => key === "warranties" ? "repairs" : key).filter((key) => PAGE_PERMISSION_KEYS.includes(key));
  return [...new Set(permissions)];
}

function firstAllowedRoute(user) {
  if (user?.isAdmin) return "/dashboard/repairs";
  const key = normalizedPagePermissions(user)[0] || "repairs";
  return permissionRoute(key);
}

function firstAllowedCategoryRoute(user) {
  const key = ["categories", "products", "attributes"].find((item) => item === "products" ? (canAccessPage(user, "services") || canAccessPage(user, "modules")) : canAccessPage(user, item)) || "categories";
  return permissionRoute(key);
}

function permissionRoute(key) {
  const routes = {
    repairs: "/dashboard/repairs",
    warranties: "/dashboard/repairs",
    products: "/dashboard/products",
    clients: "/dashboard/clients",
    categories: "/dashboard/categories",
    modules: "/dashboard/modules",
    services: "/dashboard/services",
    attributes: "/dashboard/attributes",
    technicians: "/dashboard/technicians",
    reports: "/dashboard/reports",
    finance: "/dashboard/finance",
    settings: "/dashboard/settings",
    backup: "/dashboard/backup"
  };
  return routes[key] || "/dashboard/repairs";
}

function permissionLabel(key, t) {
  const labels = {
    repairs: t("repairs"),
    clients: t("clients"),
    categories: t("brandModel"),
    modules: t("parts"),
    services: t("services"),
    products: t("productCatalog"),
    attributes: t("attributes"),
    technicians: t("technicians"),
    reports: t("reports"),
    finance: t("finance"),
    settings: t("settings"),
    backup: t("backup")
  };
  return labels[key] || key;
}

function RepairsPage({ route, data, saveData, saveRepairRecord, navigate, filters, setFilters, toast, lang, t }) {
  const isMobileLayout = useMobileLayout();
  const clientLookup = useMemo(() => new Map((data.clients || []).map((client) => [client.id, client])), [data.clients]);
  const repairLookup = useMemo(() => new Map((data.repairs || []).map((repair) => [repair.id, repair])), [data.repairs]);
  const technicianById = useMemo(() => new Map((data.technicians || []).map((technician) => [technician.id, technician])), [data.technicians]);
  const technicianByName = useMemo(() => technicianNameLookup(data.technicians || []), [data.technicians]);
  const historicalAmount = (repair) => isHistoricalAmountRepair(repair, technicianById, technicianByName);
  const getClient = (clientId) => clientLookup.get(clientId) || EMPTY_CLIENT;
  // 防抖后的已提交搜索词：避免每次按键都触发服务端请求与金额聚合重算。
  const [committedSearch, setCommittedSearch] = useState(filters.repairsSearch || "");
  const [itemsDialog, setItemsDialog] = useState({ open: false, loading: false, repair: null });
  const itemsDialogRequestRef = useRef(0);
  const path = route?.split("?")[0] || "";
  const forcedOrderType = path.startsWith("/dashboard/warranties") ? "warranty" : "";
  const orderTypeFilter = forcedOrderType || filters.repairsOrderType || "";
  useEffect(() => {
    const handle = setTimeout(() => setCommittedSearch(filters.repairsSearch || ""), 250);
    return () => clearTimeout(handle);
  }, [filters.repairsSearch]);

  // 服务端搜索：当页维修单、总数、按状态计数、单数汇总，全部走 MySQL 索引 + 分页，避免前端全表扫描。
  const [serverData, setServerData] = useState({ rows: [], total: 0, counts: {}, summary: { repairs: 0, warranties: 0 }, loading: true });
  useEffect(() => {
    let active = true;
    setServerData((prev) => ({ ...prev, loading: true }));
    const params = new URLSearchParams();
    if (committedSearch) params.set("q", committedSearch);
    if (filters.repairsStatus) params.set("status", filters.repairsStatus);
    if (orderTypeFilter) params.set("orderType", orderTypeFilter);
    if (filters.repairsStartDate) params.set("start", filters.repairsStartDate);
    if (filters.repairsEndDate) params.set("end", filters.repairsEndDate);
    params.set("page", String(filters.repairsPage || 1));
    apiGet(`/api/repairs/search?${params.toString()}`)
      .then((res) => { if (active) setServerData({ rows: res.rows || [], total: res.total || 0, counts: res.counts || {}, summary: res.summary || { repairs: 0, warranties: 0 }, loading: false }); })
      .catch(() => { if (active) setServerData({ rows: [], total: 0, counts: {}, summary: { repairs: 0, warranties: 0 }, loading: false }); });
    return () => { active = false; };
  }, [committedSearch, filters.repairsStatus, orderTypeFilter, filters.repairsStartDate, filters.repairsEndDate, filters.repairsPage, data._revision]);

  const counts = serverData.counts;
  const summary = serverData.summary;
  const total = serverData.total;
  const page = { current: filters.repairsPage || 1, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), items: serverData.rows };
  // 页码越界（例如删单后总数减少）时回钳到最后一页，避免“第 N/N 页却空列表”。
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    setFilters((prev) => (prev.repairsPage || 1) > totalPages ? { ...prev, repairsPage: totalPages } : prev);
  }, [total, setFilters]);

  // 合计金额 / 技师汇总：服务端基于与列表相同的筛选集计算（含按 IMEI/证件号/properties 搜索），
  // 与列表口径一致、金额由原有规则在服务端复算。依赖 committedSearch（防抖），不依赖 page（翻页不重算）。
  const [serverAgg, setServerAgg] = useState({ totals: { amount: 0, cost: 0, profit: 0 }, technicianRows: [], loading: true });
  useEffect(() => {
    let active = true;
    setServerAgg((prev) => ({ ...prev, loading: true }));
    const params = new URLSearchParams();
    if (committedSearch) params.set("q", committedSearch);
    if (filters.repairsStatus) params.set("status", filters.repairsStatus);
    if (orderTypeFilter) params.set("orderType", orderTypeFilter);
    if (filters.repairsStartDate) params.set("start", filters.repairsStartDate);
    if (filters.repairsEndDate) params.set("end", filters.repairsEndDate);
    apiGet(`/api/repairs/aggregates?${params.toString()}`)
      .then((res) => { if (active) setServerAgg({ totals: res.totals || { amount: 0, cost: 0, profit: 0 }, technicianRows: res.technicianRows || [], loading: false }); })
      .catch(() => { if (active) setServerAgg((prev) => ({ ...prev, loading: false })); });
    return () => { active = false; };
  }, [committedSearch, filters.repairsStatus, orderTypeFilter, filters.repairsStartDate, filters.repairsEndDate, data._revision]);
  const totals = serverAgg.totals;
  const technicianRows = serverAgg.technicianRows;
  const technicianOptions = sortCatalogRows(data.technicians || []);
  const setDatePreset = (preset) => {
    const range = repairDateRange(preset);
    setFilters({ ...filters, repairsStartDate: range.start, repairsEndDate: range.end, repairsDatePreset: preset, repairsPage: 1 });
  };
  const setOrderTypeFilter = (value) => {
    if (forcedOrderType) {
      navigate("/dashboard/repairs");
      return;
    }
    setFilters({ ...filters, repairsOrderType: filters.repairsOrderType === value ? "" : value, repairsPage: 1 });
  };
  const setCustomDate = (key, value) => {
    const next = { ...filters, repairsDatePreset: "custom", repairsPage: 1, [key]: value };
    if (key === "repairsStartDate" && next.repairsEndDate && value > next.repairsEndDate) next.repairsEndDate = value;
    if (key === "repairsEndDate" && next.repairsStartDate && value < next.repairsStartDate) next.repairsStartDate = value;
    setFilters(next);
  };
  const clearDateRange = () => setFilters({ ...filters, repairsStartDate: "", repairsEndDate: "", repairsDatePreset: "custom", repairsPage: 1 });
  const openTechnicianOrders = (row) => {
    setFilters({
      ...filters,
      technicianOrdersStartDate: filters.repairsStartDate || "",
      technicianOrdersEndDate: filters.repairsEndDate || "",
      technicianOrdersPage: 1
    });
    navigate(`/dashboard/technicians/${encodeURIComponent(row.id)}`);
  };
  const setStatus = async (id, status) => {
    const target = repairLookup.get(id);
    if (!target || isOrderLocked(target, data.settings)) return;
    const nextStatus = normalizeStatus(status);
    if (nextStatus === "取消" && normalizeStatus(target.status) !== "取消" && !window.confirm(t("cancelLockConfirm"))) return;
    const nextRepair = withStatusChange(target, nextStatus, getClient(target.clientId), data.settings);
    const ok = await saveRepairRecord(nextRepair);
    if (ok) toast(t("statusUpdated"));
  };
  const setTechnician = async (id, technicianValue) => {
    const target = repairLookup.get(id);
    if (!target || isOrderLocked(target, data.settings)) return;
    if (String(technicianValue || "").startsWith("legacy:")) return;
    const technician = technicianById.get(technicianValue);
    const nextRepair = {
      ...target,
      technicianId: technician?.id || "",
      technicianName: technician?.name || ""
    };
    const ok = await saveRepairRecord(nextRepair);
    if (ok) toast(t("saved"));
  };
  const openItemsDialog = async (event, repair) => {
    event.stopPropagation();
    if (!repair?.id) return;
    const requestId = itemsDialogRequestRef.current + 1;
    itemsDialogRequestRef.current = requestId;
    const localRepair = normalizeRepairDraft(repairLookup.get(repair.id) || repair);
    setItemsDialog({ open: true, loading: localRepair.itemsLoaded === false, repair: localRepair });
    if (localRepair.itemsLoaded !== false) return;
    try {
      const result = await apiGet(`/api/repairs/${encodeURIComponent(repair.id)}`);
      if (itemsDialogRequestRef.current !== requestId) return;
      setItemsDialog({ open: true, loading: false, repair: normalizeRepairDraft(result.repair || localRepair) });
    } catch (error) {
      if (itemsDialogRequestRef.current !== requestId) return;
      setItemsDialog({ open: true, loading: false, repair: localRepair });
      toast(error.message || t("saveFailed"));
    }
  };
  const closeItemsDialog = () => {
    itemsDialogRequestRef.current += 1;
    setItemsDialog({ open: false, loading: false, repair: null });
  };
  const saveItemsDialog = async () => {
    if (!itemsDialog.repair?.id) return;
    const ok = await saveRepairRecord(normalizeRepairDraft(itemsDialog.repair));
    if (!ok) return;
    closeItemsDialog();
    toast(t("saved"));
  };
  return (
    <section className="page">
        <Toolbar className="repairs-toolbar">
          <Button onClick={() => navigate("/dashboard/repairs/new")}><Plus {...ICON_SM} /> {t("newOrderButton")}</Button>
          <SearchInput value={filters.repairsSearch} onChange={(value) => setFilters({ ...filters, repairsSearch: value, repairsPage: 1 })} placeholder={t("search")} />
        <div className="toolbar-line-break" />
        <DateRangeFilter
          lang={lang}
          t={t}
          start={filters.repairsStartDate}
          end={filters.repairsEndDate}
          preset={filters.repairsDatePreset || "custom"}
          onStartChange={(value) => setCustomDate("repairsStartDate", value)}
          onEndChange={(value) => setCustomDate("repairsEndDate", value)}
          onPreset={setDatePreset}
          onClear={clearDateRange}
          presetItems={["today", "yesterday", "dayBeforeYesterday", "last7Days", "lastMonth"]}
        />
        <Button variant={orderTypeFilter === "warranty" ? "default" : "outline"} className="filter-pill" onClick={() => setOrderTypeFilter("warranty")}>
          {t("warrantyOrders")}<span className="filter-badge">{summary.warranties || 0}</span>
        </Button>
        {["预定", "预定到货", "维修中"].map((status) => {
          const isActive = filters.repairsStatus === status;
          return (
            <Button key={status} variant={isActive ? "default" : "outline"} className="filter-pill" onClick={() => setFilters({ ...filters, repairsStatus: isActive ? "" : status, repairsPage: 1 })}>
              {statusLabel(status, lang)}<span className="filter-badge">{counts[status] || 0}</span>
            </Button>
          );
        })}
        <Select style={{ width: 130 }} value={filters.repairsStatus} onChange={(event) => setFilters({ ...filters, repairsStatus: event.target.value, repairsPage: 1 })}>
          <option value="">{t("allStatus")}</option>
          {statusOrder.map((status) => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}
        </Select>
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="repairsPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      {isMobileLayout ? (
        <>
          <MobileBossSummary
            t={t}
            total={total}
            repairCount={summary.repairs || 0}
            warrantyCount={summary.warranties || 0}
            repairingCount={counts["维修中"] || 0}
            amount={totals.amount}
            profit={totals.profit}
            lang={lang}
          />
          <div className="mobile-order-card-list" data-smoke="mobile-order-cards">
            {page.items.length ? page.items.map((serverRow) => {
              const repair = repairLookup.get(serverRow.id) || serverRow;
              const client = getClient(repair.clientId);
              const isWarranty = repair.orderType === "warranty";
              const amount = chargeAmount(repair);
              const cost = repairCostAmount(repair);
              const profit = amount - cost;
              const legacyTechnicianName = repair.technicianId ? "" : String(repair.technicianName || "").trim();
              const rowTechnician = technicianById.get(repair.technicianId) || (legacyTechnicianName ? technicianByName.get(legacyTechnicianName.toLowerCase()) : null);
              const repairRoute = isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`;
              return (
                <MobileRepairCard
                  key={repair.id}
                  repair={repair}
                  client={client}
                  amount={amount}
                  cost={cost}
                  profit={profit}
                  technician={rowTechnician}
                  technicianOptions={technicianOptions}
                  legacyTechnicianName={legacyTechnicianName}
                  route={repairRoute}
                  navigate={navigate}
                  lang={lang}
                  t={t}
                  settings={data.settings}
                  onStatusChange={setStatus}
                  onTechnicianChange={setTechnician}
                  onItemsClick={openItemsDialog}
                />
              );
            }) : <Empty>{serverData.loading ? "…" : t("noData")}</Empty>}
          </div>
        </>
      ) : null}
      <TableContainer className="desktop-orders-table">
        <Table className="repairs-table repairs-main-table">
          <TableHeader><TableRow><TableHead>{t("ticket")}</TableHead><TableHead>{t("clientName")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("brandModel")}</TableHead><TableHead>{t("issue")}</TableHead><TableHead>{t("assignedTechnician")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("orderDate")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("costAmount")}</TableHead><TableHead>{t("profitAmount")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {page.items.length ? page.items.map((serverRow) => {
              // 优先用内存里（乐观更新后）的版本展示，避免内联改状态/技师后瞬间回弹到服务端旧值。
              const repair = repairLookup.get(serverRow.id) || serverRow;
              const client = getClient(repair.clientId);
              const isWarranty = repair.orderType === "warranty";
              const amount = chargeAmount(repair);
              const cost = repairCostAmount(repair);
              const profit = amount - cost;
              const legacyTechnicianName = repair.technicianId ? "" : String(repair.technicianName || "").trim();
              const rowTechnician = technicianById.get(repair.technicianId) || (legacyTechnicianName ? technicianByName.get(legacyTechnicianName.toLowerCase()) : null);
              const contentLabel = repairContentLabel(repair, lang);
              const repairRoute = isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`;
              return (
                <TableRow key={repair.id} className={`row-click ${isWarranty ? "order-row-warranty" : "order-row-repair"} ${rowTechnician ? "technician-marked-row" : ""}`} style={rowTechnician ? { "--technician-color": normalizeTechnicianColor(rowTechnician.color) } : undefined} onClick={() => navigate(repairRoute)}>
                  <TableCell data-label={t("ticket")}><div className="ticket-cell"><span>{repair.ticket}</span><OrderTypeBadge repair={repair} t={t} /></div></TableCell><TableCell data-label={t("clientName")}>{client.name}</TableCell><TableCell data-label={t("phone")}>{client.phone}</TableCell><TableCell data-label={t("brandModel")}>{repair.brand} / {repair.model}</TableCell><TableCell data-label={t("issue")} className="repair-issue-cell"><span title={contentLabel}>{contentLabel}</span></TableCell>
                  <TableCell data-label={t("assignedTechnician")} className="repair-technician-cell" onClick={(event) => event.stopPropagation()}>
                    <TechnicianPicker
                      className="repair-technician-inline"
                      value={repair.technicianId || ""}
                      legacyName={legacyTechnicianName}
                      selectedTechnician={rowTechnician}
                      technicians={technicianOptions}
                      disabled={isOrderLocked(repair, data.settings)}
                      placeholder={t("unassignedTechnician")}
                      portal
                      onChange={(value) => setTechnician(repair.id, value)}
                      t={t}
                    />
                  </TableCell>
                  <TableCell data-label={t("status")} onClick={(event) => event.stopPropagation()}>
                    <Select className={`status-select ${statusClassMap[normalizeStatus(repair.status)] || "status-reserva"}`} value={normalizeStatus(repair.status)} disabled={isOrderLocked(repair, data.settings)} onChange={(event) => setStatus(repair.id, event.target.value)} style={{ width: 118, height: 30 }}>{(isWarranty ? warrantyStatusOrder : statusOrder).map((status) => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}</Select>
                  </TableCell>
                  <TableCell data-label={t("orderDate")}>{formatDateTimeDisplay(repair.repairTime, lang)}</TableCell>
                  <TableCell data-label={t("total")} className="money-cell">{money(amount)}</TableCell>
                  <TableCell data-label={t("costAmount")} className="money-cell">{money(cost)}</TableCell>
                  <TableCell data-label={t("profitAmount")} className={`money-cell ${profit < 0 ? "negative" : ""}`}>{money(profit)}</TableCell>
                  <TableCell data-label={t("operation")} className="repair-row-actions" onClick={(event) => event.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={(event) => openItemsDialog(event, repair)}><Menu {...ICON_SM} /> {t("operation")}</Button>
                  </TableCell>
                </TableRow>
              );
            }) : <TableRow><TableCell colSpan={12}><Empty>{serverData.loading ? "…" : t("noData")}</Empty></TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <section className="repair-technician-summary">
        <div className="section-heading">
          <h2>{t("technicianRangeStats")}</h2>
        </div>
        {isMobileLayout ? (
          <div className="mobile-technician-rank" data-smoke="mobile-repair-technician-rank">
            {technicianRows.length ? technicianRows.map((row, index) => {
              const rowTechnician = String(row.id || "").startsWith("id:") ? technicianById.get(String(row.id).slice(3)) : null;
              return <MobileTechnicianRankCard key={row.id} row={row} rank={index + 1} technician={rowTechnician} onClick={() => openTechnicianOrders(row)} t={t} />;
            }) : <Empty compact>{t("noData")}</Empty>}
          </div>
        ) : null}
        <TableContainer className="desktop-technician-summary">
          <Table className="repair-technician-summary-table">
            <TableHeader><TableRow><TableHead>{t("assignedTechnician")}</TableHead><TableHead>{t("orderCount")}</TableHead><TableHead>{t("technicianRepairOrders")}</TableHead><TableHead>{t("technicianWarrantyOrders")}</TableHead><TableHead>{t("repairAmount")}</TableHead><TableHead>{t("costAmount")}</TableHead><TableHead>{t("profitAmount")}</TableHead></TableRow></TableHeader>
            <TableBody>{technicianRows.length ? technicianRows.map((row) => {
              const rowTechnician = String(row.id || "").startsWith("id:") ? technicianById.get(String(row.id).slice(3)) : null;
              return (
              <TableRow key={row.id} className={`row-click ${row.isUnassigned ? "technician-row-unassigned" : ""}`} onClick={() => openTechnicianOrders(row)}>
                <TableCell><div className="technician-name-cell"><TechnicianColorDot technician={rowTechnician} /><b>{row.isUnassigned ? t("unassignedTechnician") : row.name || t("technician")}</b></div></TableCell>
                <TableCell className="count-cell">{row.orderCount}</TableCell>
                <TableCell className="count-cell">{row.repairCount}</TableCell>
                <TableCell className="count-cell">{row.warrantyCount}</TableCell>
                <TableCell className="money-cell">{money(row.amount)}</TableCell>
                <TableCell className="money-cell">{money(row.cost)}</TableCell>
                <TableCell className={`money-cell ${row.profit < 0 ? "negative" : ""}`}>{money(row.profit)}</TableCell>
              </TableRow>
              );
            }) : <TableRow><TableCell colSpan={7}><Empty compact>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
          </Table>
        </TableContainer>
      </section>
      <div className="repair-list-summary">
        <Metric className="metric-muted" title={t("repairListSummary")} value={total} />
        <Metric className="metric-muted" title={t("filteredRepairOrders")} value={summary.repairs} />
        <Metric className="metric-muted" title={t("filteredWarrantyOrders")} value={summary.warranties} />
        <Metric className="metric-muted" title={t("total")} value={money(totals.amount)} />
        <Metric className="metric-muted" title={t("profitAmount")} value={money(totals.profit)} />
      </div>
      <Dialog open={itemsDialog.open} onOpenChange={(open) => !open && closeItemsDialog()} title={itemsDialog.repair?.ticket ? `${t("operation")} ${itemsDialog.repair.ticket}` : t("operation")} contentClassName="repair-items-dialog-content">
        <DialogBody className="repair-items-dialog">
          {itemsDialog.loading ? <Empty compact>…</Empty> : itemsDialog.repair ? (
            <>
              <PriceEditor draft={itemsDialog.repair} setRepairDraft={(repair) => setItemsDialog((current) => ({ ...current, repair }))} t={t} />
              <TableContainer className="price-items-wrap">
                <RepairItemsTable className="repair-items-table-operation" draft={itemsDialog.repair} setRepairDraft={(repair) => setItemsDialog((current) => ({ ...current, repair }))} t={t} lang={lang} />
              </TableContainer>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={closeItemsDialog}>{t("cancel")}</Button>
                <Button type="button" onClick={saveItemsDialog}>{t("save")}</Button>
              </DialogFooter>
            </>
          ) : <Empty compact>{t("noData")}</Empty>}
        </DialogBody>
      </Dialog>
    </section>
  );
}

function QuickFindPage({ data, navigate, lang, t }) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const repairs = data.repairs || [];
  const exactRepair = repairs.find((repair) => String(repair.ticket || "").toLowerCase() === normalizedQuery);
  const matches = normalizedQuery
    ? repairs.filter((repair) => [repair.ticket, repair.brand, repair.model, repair.issue].join(" ").toLowerCase().includes(normalizedQuery)).slice(0, 8)
    : repairs.slice(0, 8);

  const stopCamera = () => {
    zxingControlsRef.current?.stop?.();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };
  const openRepair = (repair) => {
    if (!repair) {
      setMessage(t("noOrderFound"));
      return;
    }
    setMessage(t("exactMatchOpen"));
    stopCamera();
    navigate(`/dashboard/repairs/${repair.id}`);
  };
  const openTicketValue = (rawValue) => {
    const value = scannedTicketValue(rawValue);
    if (!value) return;
    setQuery(value);
    const found = findRepairByTicket(repairs, rawValue);
    if (found) openRepair(found);
    else setMessage(t("noOrderFound"));
  };
  const submit = () => {
    if (!normalizedQuery) {
      setMessage(t("noOrderFound"));
      return;
    }
    openRepair(exactRepair || matches[0]);
  };

  useEffect(() => {
    if (!cameraActive) return undefined;
    let cancelled = false;
    let frame = 0;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!("BarcodeDetector" in window)) {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          let controls = null;
          controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
            const value = result?.getText?.();
            if (!value) return;
            controls?.stop?.();
            zxingControlsRef.current = null;
            openTicketValue(value);
          });
          if (cancelled) {
            controls?.stop?.();
            return;
          }
          zxingControlsRef.current = controls;
          return;
        }
        const detector = new window.BarcodeDetector({ formats: ["code_39", "code_128", "qr_code", "ean_13", "ean_8"] });
        const scan = async () => {
          if (cancelled || !videoRef.current || !streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.[0]?.rawValue?.trim();
            if (value) {
              openTicketValue(value);
              return;
            }
          } catch {
            // 继续下一帧，摄像头画面未就绪时会偶发失败。
          }
          frame = window.requestAnimationFrame(scan);
        };
        scan();
      } catch {
        setMessage(t("cameraError"));
        setCameraActive(false);
      }
    }
    start();
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      zxingControlsRef.current?.stop?.();
      zxingControlsRef.current = null;
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraActive, repairs, t]);

  return (
    <section className="page quick-find-page">
      <Card className="quick-find-card">
        <CardHeader><CardTitle><ScanLine {...ICON} /> {t("quickFindTitle")}</CardTitle></CardHeader>
        <CardContent>
          <p className="quick-find-hint">{t("quickFindHint")}</p>
          <div className="quick-find-grid">
            <div className="quick-find-main">
              <Field className="quick-ticket-field">
                <FieldIcon><Search {...ICON_SM} /></FieldIcon>
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={t("quickOrderInput")}
                />
              </Field>
              <div className="quick-actions">
                <Button onClick={submit}>{t("openOrder")}</Button>
                <Button variant="outline" onClick={() => cameraActive ? stopCamera() : setCameraActive(true)}>
                  {cameraActive ? <Camera {...ICON_SM} /> : <ScanLine {...ICON_SM} />} {cameraActive ? t("stopCamera") : t("startCamera")}
                </Button>
              </div>
              <small className="quick-find-hint">{t("scanGunHint")}</small>
              {message ? <div className="quick-message">{message}</div> : null}
              <div className="quick-result-list">
                {matches.length ? matches.map((repair) => (
                  <ResultButton key={repair.id} active={repair.id === exactRepair?.id} onClick={() => openRepair(repair)}>
                    <b>{repair.ticket || "-"}</b>
                    <span>{[repair.brand, repair.model].filter(Boolean).join(" / ") || "-"}</span>
                    <StatusPill status={repair.status} lang={lang} />
                  </ResultButton>
                )) : <Empty compact>{t("noOrderFound")}</Empty>}
              </div>
            </div>
            <div className="quick-camera-panel">
              <video ref={videoRef} muted playsInline />
              {cameraActive ? <div className="barcode-scan-overlay"><span>{t("barcodeScanGuide")}</span></div> : null}
              {!cameraActive ? <div className="quick-camera-empty"><Camera {...ICON} /><span>{t("startCamera")}</span></div> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ScanSearchDialog({ open, onOpenChange, query, setQuery, message, setMessage, onSubmit, t }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const submit = () => onSubmit(query);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("scanShortcutTitle")}>
      <DialogBody className="scan-search-dialog">
        <Field className="scan-search-field">
          <FieldIcon><Search {...ICON_SM} /></FieldIcon>
          <Input
            ref={inputRef}
            value={query}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== "Tab") return;
              event.preventDefault();
              submit();
            }}
            placeholder={t("quickOrderInput")}
          />
        </Field>
        {message ? <div className="quick-message">{message}</div> : null}
        <DialogFooter className="scan-search-actions">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={submit}><ScanLine {...ICON_SM} /> {t("openOrder")}</Button>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}

function ClientsPage({ data, saveData, deleteClientRecord, filters, setFilters, setModal, toast, navigate, lang, t }) {
  const clientRepairsById = useMemo(() => {
    const map = new Map((data.clients || []).map((client) => [client.id, []]));
    for (const repair of data.repairs || []) {
      if (!repair.clientId) continue;
      if (!map.has(repair.clientId)) map.set(repair.clientId, []);
      map.get(repair.clientId).push(repair);
    }
    for (const repairs of map.values()) {
      repairs.sort((a, b) => String(b.repairTime || b.ticket || "").localeCompare(String(a.repairTime || a.ticket || "")));
    }
    return map;
  }, [data.clients, data.repairs]);
  const clientStats = (clientId) => {
    const repairs = clientRepairsById.get(clientId) || [];
    return {
      total: repairs.length,
      open: repairs.filter((repair) => !isLockingFinalStatus(repair.status)).length,
      latest: repairs[0]
    };
  };
  const rows = useMemo(() => {
    const search = filters.clientsSearch.toLowerCase();
    const filtered = (data.clients || []).filter((client) => {
      const stats = clientStats(client.id);
      const matchesSearch = [client.name, client.identity, client.email, client.phone, client.address].join(" ").toLowerCase().includes(search);
      const matchesFilter = filters.clientsFilter === "open"
        ? stats.open > 0
        : filters.clientsFilter === "records"
          ? stats.total > 0
          : filters.clientsFilter === "no-records"
            ? stats.total === 0
            : true;
      return matchesSearch && matchesFilter;
    });
    return filtered.sort((a, b) => {
      const aStats = clientStats(a.id);
      const bStats = clientStats(b.id);
      if (filters.clientsSort === "records") return bStats.total - aStats.total || String(a.name || "").localeCompare(String(b.name || ""));
      if (filters.clientsSort === "open") return bStats.open - aStats.open || bStats.total - aStats.total || String(a.name || "").localeCompare(String(b.name || ""));
      if (filters.clientsSort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      return String(bStats.latest?.repairTime || bStats.latest?.ticket || "").localeCompare(String(aStats.latest?.repairTime || aStats.latest?.ticket || "")) || bStats.total - aStats.total || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [data.clients, filters.clientsFilter, filters.clientsSearch, filters.clientsSort, clientRepairsById]);
  const page = paginate(rows, filters.clientsPage, 20);
  const remove = async (clientId) => {
    if (data.repairs.some((repair) => repair.clientId === clientId)) return toast(t("cannotDeleteClient"));
    if (!confirm(t("confirmDeleteClient"))) return;
    const ok = deleteClientRecord
      ? await deleteClientRecord(clientId)
      : await saveData((current) => ({ ...current, clients: current.clients.filter((client) => client.id !== clientId) }));
    if (!ok) return;
  };
  const openClientOrders = (clientId) => navigate(`/dashboard/clients/${encodeURIComponent(clientId)}`);
  return (
    <section className="page">
      <Toolbar className="clients-toolbar">
        <Button onClick={() => setModal({ type: "client" })}><Plus {...ICON_SM} /> {t("add")}</Button>
        <SearchInput value={filters.clientsSearch} onChange={(value) => setFilters({ ...filters, clientsSearch: value, clientsPage: 1 })} placeholder={t("search")} />
        <Select style={{ width: 138 }} value={filters.clientsFilter || "all"} onChange={(event) => setFilters({ ...filters, clientsFilter: event.target.value, clientsPage: 1 })}>
          <option value="all">{t("clientFilterAll")}</option>
          <option value="open">{t("clientFilterOpen")}</option>
          <option value="records">{t("clientFilterRecords")}</option>
          <option value="no-records">{t("clientFilterNoRecords")}</option>
        </Select>
        <Select style={{ width: 148 }} value={filters.clientsSort || "latest"} onChange={(event) => setFilters({ ...filters, clientsSort: event.target.value, clientsPage: 1 })}>
          <option value="latest">{t("clientSortLatest")}</option>
          <option value="records">{t("clientSortRecords")}</option>
          <option value="open">{t("clientSortOpen")}</option>
          <option value="name">{t("clientSortName")}</option>
        </Select>
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="clientsPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <TableContainer>
        <Table className="clients-table">
          <TableHeader><TableRow><TableHead>{t("clientName")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("repairRecords")}</TableHead><TableHead>{t("latestRepair")}</TableHead><TableHead>{t("identity")}</TableHead><TableHead>{t("email")}</TableHead><TableHead>{t("address")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((client) => {
            const stats = clientStats(client.id);
            return (
                <TableRow key={client.id} className="row-click client-row" onClick={() => openClientOrders(client.id)}>
                  <TableCell data-label={t("clientName")}>
                    <div className="client-name-cell"><TextLink className="client-name-link" href={`#/dashboard/clients/${encodeURIComponent(client.id)}`} onClick={(event) => event.stopPropagation()}>{client.name || "-"}</TextLink><ClientLevelBadge level={client.level} lang={lang} /></div>
                  </TableCell>
                  <TableCell data-label={t("phone")} onClick={(event) => event.stopPropagation()}>{client.phone ? <TextLink className="table-link" href={`tel:${client.phone}`}>{client.phone}</TextLink> : "-"}</TableCell>
                  <TableCell data-label={t("repairRecords")}>
                    <TextLink className="client-record-toggle" href={`#/dashboard/clients/${encodeURIComponent(client.id)}`} onClick={(event) => event.stopPropagation()}>
                      {stats.total} {t("times")}{stats.open ? ` · ${stats.open} ${t("unfinished")}` : ""}
                    </TextLink>
                  </TableCell>
                  <TableCell data-label={t("latestRepair")}>{stats.latest ? <TextLink className="client-latest-order" href={`#/dashboard/repairs/${stats.latest.id}`} onClick={(event) => event.stopPropagation()}>{stats.latest.brand || ""} {stats.latest.model || ""} · {statusLabel(stats.latest.status, lang)}</TextLink> : "-"}</TableCell>
                  <TableCell data-label={t("identity")}>{client.identity || "-"}</TableCell>
                  <TableCell data-label={t("email")}>{client.email || "-"}</TableCell>
                  <TableCell data-label={t("address")}>{client.address || "-"}</TableCell>
                  <TableCell data-label={t("operation")} onClick={(event) => event.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => setModal({ type: "client", id: client.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}
                    <Button size="sm" variant="danger" onClick={() => remove(client.id)}><Trash2 {...ICON_SM} /> {t("delete")}</Button>
                  </TableCell>
                </TableRow>
            );
          }) : <TableRow><TableCell colSpan={8}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function ClientOrdersPage({ data, clientId, navigate, filters, setFilters, lang, t }) {
  const client = (data.clients || []).find((item) => item.id === clientId);
  const technicianById = useMemo(() => new Map((data.technicians || []).map((technician) => [technician.id, technician])), [data.technicians]);
  const technicianByName = useMemo(() => technicianNameLookup(data.technicians || []), [data.technicians]);
  const startDate = filters.clientOrdersStartDate || "";
  const endDate = filters.clientOrdersEndDate || "";
  const orders = (data.repairs || [])
    .filter((repair) => repair.clientId === clientId)
    .sort((a, b) => String(b.repairTime || b.ticket || "").localeCompare(String(a.repairTime || a.ticket || "")));
  const filteredOrders = orders.filter((repair) => {
    const day = String(repair.repairTime || "").slice(0, 10);
    return (!startDate || day >= startDate) && (!endDate || day <= endDate);
  });
  const page = paginate(filteredOrders, filters.clientOrdersPage);
  const businessFilteredOrders = filteredOrders.filter((repair) => !isCanceledRepair(repair));
  const totals = businessFilteredOrders.reduce((sum, repair) => {
    const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
    const amount = skipAmount ? 0 : chargeAmount(repair);
    const cost = skipAmount ? 0 : repairCostAmount(repair);
    return {
      amount: sum.amount + amount,
      profit: sum.profit + amount - cost,
      open: sum.open + (isLockingFinalStatus(repair.status) ? 0 : 1)
    };
  }, { amount: 0, profit: 0, open: 0 });
  const updateDate = (key, value) => {
    const next = { ...filters, [key]: value, clientOrdersPage: 1 };
    if (key === "clientOrdersStartDate" && next.clientOrdersEndDate && value > next.clientOrdersEndDate) next.clientOrdersEndDate = value;
    if (key === "clientOrdersEndDate" && next.clientOrdersStartDate && value < next.clientOrdersStartDate) next.clientOrdersStartDate = value;
    setFilters(next);
  };
  const clearDate = () => setFilters({ ...filters, clientOrdersStartDate: "", clientOrdersEndDate: "", clientOrdersPage: 1 });
  return (
    <section className="page client-orders-page">
      <Toolbar className="technician-orders-toolbar">
        <Button variant="outline" onClick={() => navigate("/dashboard/clients")}><ChevronLeft {...ICON_SM} /> {t("backToClients")}</Button>
        <div className="technician-orders-title">
          <b>{client?.name || t("clientOrders")}</b>
          <span>{filteredOrders.length} {t("orders")} / {orders.length} {t("orders")}</span>
        </div>
        <DateRangeFilter
          lang={lang}
          t={t}
          start={startDate}
          end={endDate}
          onStartChange={(value) => updateDate("clientOrdersStartDate", value)}
          onEndChange={(value) => updateDate("clientOrdersEndDate", value)}
          onClear={clearDate}
          showPresets={false}
        />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="clientOrdersPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <div className="metric-grid technician-orders-summary-grid">
        <Metric title={t("orderCount")} value={businessFilteredOrders.length} />
        <Metric title={t("technicianOpenOrders")} value={totals.open} />
        <Metric title={t("repairAmount")} value={money(totals.amount)} />
        <Metric title={t("profitAmount")} value={money(totals.profit)} />
      </div>
      <TableContainer>
        <Table className="repairs-table client-orders-table">
          <TableHeader><TableRow><TableHead>{t("ticket")}</TableHead><TableHead>{t("clientName")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("brandModel")}</TableHead><TableHead>{t("issue")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("orderDate")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("costAmount")}</TableHead><TableHead>{t("profitAmount")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((repair) => {
            const amount = chargeAmount(repair);
            const cost = repairCostAmount(repair);
            const profit = amount - cost;
            const isWarranty = repair.orderType === "warranty";
            const repairRoute = isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`;
            const contentLabel = repairContentLabel(repair, lang);
            return (
              <TableRow key={repair.id} className={`row-click ${isWarranty ? "order-row-warranty" : "order-row-repair"}`} onClick={() => navigate(repairRoute)}>
                <TableCell data-label={t("ticket")}><div className="ticket-cell"><TextLink className="table-link" href={`#${repairRoute}`} onClick={(event) => event.stopPropagation()}>{repair.ticket}</TextLink><OrderTypeBadge repair={repair} t={t} /></div></TableCell>
                <TableCell data-label={t("clientName")}>{client?.name || "-"}</TableCell>
                <TableCell data-label={t("phone")}>{client?.phone || "-"}</TableCell>
                <TableCell data-label={t("brandModel")}>{repair.brand} / {repair.model}</TableCell>
                <TableCell data-label={t("issue")} className="repair-issue-cell"><span title={contentLabel}>{contentLabel}</span></TableCell>
                <TableCell data-label={t("status")}><StatusPill status={normalizeStatus(repair.status)} lang={lang} /></TableCell>
                <TableCell data-label={t("orderDate")}>{formatDateTimeDisplay(repair.repairTime, lang)}</TableCell>
                <TableCell data-label={t("total")} className="money-cell">{money(amount)}</TableCell>
                <TableCell data-label={t("costAmount")} className="money-cell">{money(cost)}</TableCell>
                <TableCell data-label={t("profitAmount")} className={`money-cell ${profit < 0 ? "negative" : ""}`}>{money(profit)}</TableCell>
              </TableRow>
            );
          }) : <TableRow><TableCell colSpan={10}><Empty>{t("noRepairRecords")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function CategoriesPage({ data, saveData, saveNonRepairResource, filters, setFilters, currentBrandId, setCurrentBrandId, setModal, toast, t }) {
  const brands = sortCatalogRows(data.brands).filter((brand) => brand.name.toLowerCase().includes(filters.brandsSearch.toLowerCase()));
  const current = data.brands.find((brand) => brand.id === currentBrandId) || brands[0] || data.brands[0];
  const models = current ? sortCatalogRows(data.models.filter((model) => model.brandId === current.id)) : [];
  const saveCatalog = (updater) => saveNonRepairResource ? saveNonRepairResource("catalog", updater) : saveData(updater);
  const [draggingBrandId, setDraggingBrandId] = useState(null);
  const [draggingModelId, setDraggingModelId] = useState(null);
  const reorderBrands = (targetId) => {
    if (!draggingBrandId || draggingBrandId === targetId) return;
    saveCatalog((value) => ({ ...value, brands: reorderVisibleRows(value.brands || [], draggingBrandId, targetId, brands.map((brand) => brand.id)) }));
  };
  const reorderModels = (targetId) => {
    if (!draggingModelId || draggingModelId === targetId || !current) return;
    saveCatalog((value) => ({
      ...value,
      models: reorderVisibleRows(value.models || [], draggingModelId, targetId, models.map((model) => model.id), (row) => row.brandId === current.id)
    }));
  };
  const deleteBrand = (brandId) => {
    if (data.models.some((model) => model.brandId === brandId)) return toast(t("cannotDeleteBrand"));
    if (!confirm(t("confirmDeleteBrand"))) return;
    saveCatalog((value) => ({ ...value, brands: value.brands.filter((brand) => brand.id !== brandId) }));
  };
  return (
    <section className="page">
      <Toolbar>
        <Button onClick={() => setModal({ type: "brand" })}><Plus {...ICON_SM} /> {t("addBrand")}</Button>
        <SearchInput value={filters.brandsSearch} onChange={(value) => setFilters({ ...filters, brandsSearch: value })} placeholder={t("search")} />
      </Toolbar>
      <div className="category-layout">
        <div className="brand-list">
          {brands.map((brand) => (
            <BrandItem
              key={brand.id}
              active={current?.id === brand.id}
              className={draggingBrandId === brand.id ? "dragging" : ""}
              draggable
              onClick={() => setCurrentBrandId(brand.id)}
              onDragStart={(event) => {
                setDraggingBrandId(brand.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", brand.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderBrands(brand.id);
                setDraggingBrandId(null);
              }}
              onDragEnd={() => setDraggingBrandId(null)}
            >
              {brand.name}
            </BrandItem>
          ))}
        </div>
        <div>
          {current ? (
            <>
              <div className="brand-head">
                <h2>{current.name}</h2>
                <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, brands: moveSortedRow(value.brands || [], current.id, -1) }))}><ChevronUp {...ICON_SM} /></Button>
                <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, brands: moveSortedRow(value.brands || [], current.id, 1) }))}><ChevronDown {...ICON_SM} /></Button>
                <Button size="sm" variant="outline" onClick={() => setModal({ type: "brand", id: current.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>
                <Button size="sm" variant="danger" onClick={() => deleteBrand(current.id)}><Trash2 {...ICON_SM} /> {t("delete")}</Button>
              </div>
              <div style={{ padding: "0 0 16px" }}>
                <Button onClick={() => setModal({ type: "model", brandId: current.id })}><Plus {...ICON_SM} /> {t("addModel")}</Button>
              </div>
              <TableContainer>
                <Table className="catalog-table">
                  <TableHeader><TableRow><TableHead>{t("model")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
                  <TableBody>{models.length ? models.map((model) => (
                    <TableRow
                      key={model.id}
                      className={`draggable-row${draggingModelId === model.id ? " dragging" : ""}`}
                      draggable
                      onDragStart={(event) => {
                        setDraggingModelId(model.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", model.id);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderModels(model.id);
                        setDraggingModelId(null);
                      }}
                      onDragEnd={() => setDraggingModelId(null)}
                    >
                      <TableCell>{model.name}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, models: moveSortedRow(value.models || [], model.id, -1, (row) => row.brandId === current.id) }))}><ChevronUp {...ICON_SM} /></Button>{" "}
                        <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, models: moveSortedRow(value.models || [], model.id, 1, (row) => row.brandId === current.id) }))}><ChevronDown {...ICON_SM} /></Button>{" "}
                        <Button size="sm" variant="outline" onClick={() => setModal({ type: "model", id: model.id, brandId: current.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}
                        <Button size="sm" variant="danger" onClick={() => {
                          if (data.repairs.some((repair) => (repair.brand || "").toLowerCase() === current.name.toLowerCase() && repair.model === model.name)) return toast(t("cannotDeleteModel"));
                          if (!confirm(t("confirmDeleteModel"))) return;
                          saveCatalog((value) => ({ ...value, models: value.models.filter((item) => item.id !== model.id) }));
                        }}><Trash2 {...ICON_SM} /> {t("delete")}</Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={2}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
                </Table>
              </TableContainer>
            </>
          ) : <Empty>{t("noData")}</Empty>}
        </div>
      </div>
    </section>
  );
}

function ProductsPage({ catalogTab, setCatalogTab, t, ...props }) {
  const canServices = canAccessPage(props.session, "services");
  const canParts = canAccessPage(props.session, "modules");
  const topCategories = productTopCategories(props.data.settings);
  const topCategoryKey = topCategories.join("|");
  const customTabActive = productTopCategoryFromTab(catalogTab);
  const type = catalogTab === "parts" && canParts ? "parts" : customTabActive && canServices ? catalogTab : canServices ? "services" : "parts";
  useEffect(() => {
    const custom = productTopCategoryFromTab(catalogTab);
    if ((catalogTab === "services" && !canServices) || (catalogTab === "parts" && !canParts) || (custom && (!canServices || !topCategories.includes(custom)))) {
      setCatalogTab(canServices ? "services" : "parts");
    }
  }, [catalogTab, canParts, canServices, setCatalogTab, topCategoryKey]);
  const addTopCategory = () => {
    const name = normalizeProductCategory(window.prompt(t("categoryName")));
    if (!name) return;
    const saveCatalog = props.saveNonRepairResource ? (updater) => props.saveNonRepairResource("catalog", updater) : props.saveData;
    saveCatalog((state) => {
      const current = productTopCategories(state.settings);
      if (current.includes(name)) return state;
      return { ...state, settings: { ...(state.settings || {}), productCatalogCategories: [...current, name] } };
    });
    setCatalogTab(productTopCategoryTab(name));
  };
  if (!canServices && !canParts) return <section className="page"><Empty>{t("noPermission")}</Empty></section>;
  return (
    <section className="page product-page">
      <Tabs className="product-page-tabs">
        {canServices ? <TabsTrigger active={type === "services"} onClick={() => setCatalogTab("services")}><Sparkles {...ICON_SM} /> {t("productService")}</TabsTrigger> : null}
        {canParts ? <TabsTrigger active={type === "parts"} onClick={() => setCatalogTab("parts")}><Package {...ICON_SM} /> {t("productPart")}</TabsTrigger> : null}
        {canServices ? topCategories.map((category) => (
          <TabsTrigger key={category} active={type === productTopCategoryTab(category)} onClick={() => setCatalogTab(productTopCategoryTab(category))}><Folder {...ICON_SM} /> {category}</TabsTrigger>
        )) : null}
        {canServices ? <Button size="sm" variant="outline" onClick={addTopCategory}><FolderPlus {...ICON_SM} /> {t("addProductCategory")}</Button> : null}
      </Tabs>
      <CatalogPage {...props} type={type} t={t} embedded />
    </section>
  );
}

function CatalogPage({ data, saveData, saveNonRepairResource, filters, setFilters, setModal, type, lang, session, t, embedded = false }) {
  const customTopCategory = productTopCategoryFromTab(type);
  const isService = type !== "parts";
  const collectionKey = isService ? "services" : "parts";
  const saveCatalog = (updater) => saveNonRepairResource ? saveNonRepairResource("catalog", updater) : saveData(updater);
  const canManage = isService ? canAccessPage(session, "services") : canAccessPage(session, "modules");
  const [draggingItemId, setDraggingItemId] = useState(null);
  if (!canManage) return <section className="page"><Empty>{t("noPermission")}</Empty></section>;
  const searchKey = isService ? "servicesSearch" : "partsSearch";
  const categoryKey = isService ? "servicesCategory" : "partsCategory";
  const pageKey = isService ? "servicesPage" : "partsPage";
  const explicitCategories = isService ? data.settings?.productServiceCategories : data.settings?.productPartCategories;
  const topCategories = productTopCategories(data.settings);
  const categories = productCategories(data[collectionKey], explicitCategories, t);
  const selectedCategory = filters[categoryKey] || "";
  const rows = sortCatalogRows(data[collectionKey]).filter((item) => {
    const matchesSearch = [item.defaultName, item.category, item.zh, item.es, item.price].join(" ").toLowerCase().includes(filters[searchKey].toLowerCase());
    const itemCategory = productCategoryValue(item, t);
    const matchesTopCategory = customTopCategory ? itemCategory === customTopCategory : embedded && isService ? !topCategories.includes(itemCategory) : true;
    const matchesCategory = embedded || customTopCategory ? true : !selectedCategory || itemCategory === selectedCategory;
    return matchesSearch && matchesTopCategory && matchesCategory;
  });
  const page = paginate(rows, filters[pageKey]);
  const reorderItems = (targetId) => {
    if (!draggingItemId || draggingItemId === targetId) return;
    saveCatalog((value) => ({
      ...value,
      [collectionKey]: reorderVisibleRows(value[collectionKey] || [], draggingItemId, targetId, page.items.map((item) => item.id))
    }));
  };
  const addCategory = () => {
    const name = window.prompt(t("categoryName"));
    const category = normalizeProductCategory(name, "");
    if (!category) return;
    const settingsKey = isService ? "productServiceCategories" : "productPartCategories";
    saveCatalog((state) => {
      const current = Array.isArray(state.settings?.[settingsKey]) ? state.settings[settingsKey] : [];
      if (current.includes(category)) return state;
      return { ...state, settings: { ...(state.settings || {}), [settingsKey]: [...current, category] } };
    });
    setFilters({ ...filters, [categoryKey]: category, [pageKey]: 1 });
  };
  const content = (
    <>
      {!embedded ? <div className="product-category-bar">
        <CategoryPill active={!selectedCategory} onClick={() => setFilters({ ...filters, [categoryKey]: "", [pageKey]: 1 })}>{t("allProductCategories")}</CategoryPill>
        {categories.map((category) => (
          <CategoryPill key={category} active={selectedCategory === category} onClick={() => setFilters({ ...filters, [categoryKey]: category, [pageKey]: 1 })}>{category}</CategoryPill>
        ))}
        <Button size="sm" variant="outline" onClick={addCategory}><FolderPlus {...ICON_SM} /> {t("addProductCategory")}</Button>
      </div> : null}
      <Toolbar>
        <Button onClick={() => setModal({ type: isService ? "service" : "part", category: customTopCategory || "" })}><Plus {...ICON_SM} /> {t("add")}</Button>
        <SearchInput value={filters[searchKey]} onChange={(value) => setFilters({ ...filters, [searchKey]: value, [pageKey]: 1 })} placeholder={t("search")} />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey={pageKey} filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <TableContainer>
        <Table className="catalog-table">
          <TableHeader><TableRow><TableHead>{t("name")}</TableHead>{embedded ? null : <TableHead>{t("productCategory")}</TableHead>}<TableHead>{t("chinese")}</TableHead><TableHead>{t("spanish")}</TableHead><TableHead>{t("price")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((item) => (
            <TableRow
              key={item.id}
              className={`draggable-row${draggingItemId === item.id ? " dragging" : ""}`}
              draggable
              onDragStart={(event) => {
                setDraggingItemId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderItems(item.id);
                setDraggingItemId(null);
              }}
              onDragEnd={() => setDraggingItemId(null)}
            >
              <TableCell>{catalogLabel(item, lang)}</TableCell>{embedded ? null : <TableCell>{productCategoryValue(item, t)}</TableCell>}<TableCell>{item.zh}</TableCell><TableCell>{item.es}</TableCell><TableCell>{money(item.price)}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, [collectionKey]: moveSortedRow(value[collectionKey] || [], item.id, -1) }))}><ChevronUp {...ICON_SM} /></Button>{" "}
                <Button size="sm" variant="outline" onClick={() => saveCatalog((value) => ({ ...value, [collectionKey]: moveSortedRow(value[collectionKey] || [], item.id, 1) }))}><ChevronDown {...ICON_SM} /></Button>{" "}
                <Button size="sm" variant="outline" onClick={() => setModal({ type: isService ? "service" : "part", id: item.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => {
                  if (!confirm(t("confirmDelete"))) return;
                  saveCatalog((value) => ({ ...value, [collectionKey]: value[collectionKey].filter((entry) => entry.id !== item.id) }));
                }}><Trash2 {...ICON_SM} /> {t("delete")}</Button>
              </TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={embedded ? 5 : 6}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </>
  );
  if (embedded) return content;
  return <section className="page">{content}</section>;
}

function AttributesPage({ data, saveData, saveNonRepairResource, filters, setFilters, setModal, lang, t }) {
  const rows = sortCatalogRows(data.attributes || []).filter((item) => [item.groupName, item.defaultName, item.zh, item.es].join(" ").toLowerCase().includes(filters.attributesSearch.toLowerCase()));
  const page = paginate(rows, filters.attributesPage);
  const saveAttributes = (updater) => saveNonRepairResource ? saveNonRepairResource("attributes", updater) : saveData(updater);
  const [draggingAttributeId, setDraggingAttributeId] = useState(null);
  const reorderAttributes = (targetId) => {
    if (!draggingAttributeId || draggingAttributeId === targetId) return;
    saveAttributes((value) => ({ ...value, attributes: reorderVisibleRows(value.attributes || [], draggingAttributeId, targetId, page.items.map((item) => item.id)) }));
  };
  return (
    <section className="page">
      <Toolbar>
        <Button onClick={() => setModal({ type: "attribute" })}><Plus {...ICON_SM} /> {t("add")}</Button>
        <SearchInput value={filters.attributesSearch} onChange={(value) => setFilters({ ...filters, attributesSearch: value, attributesPage: 1 })} placeholder={t("search")} />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="attributesPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <TableContainer>
        <Table className="catalog-table catalog-table-attributes">
          <TableHeader><TableRow><TableHead>{t("group")}</TableHead><TableHead>{t("defaultName")}</TableHead><TableHead>{t("chinese")}</TableHead><TableHead>{t("spanish")}</TableHead><TableHead className="catalog-actions-head">{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((item) => (
            <TableRow
              key={item.id}
              className={`draggable-row${draggingAttributeId === item.id ? " dragging" : ""}`}
              draggable
              onDragStart={(event) => {
                setDraggingAttributeId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                reorderAttributes(item.id);
                setDraggingAttributeId(null);
              }}
              onDragEnd={() => setDraggingAttributeId(null)}
            >
              <TableCell className="catalog-group-cell">{attributeGroupLabel(item.groupName || "其他", t)}</TableCell>
              <TableCell className="catalog-text-cell">{item.defaultName}</TableCell>
              <TableCell className="catalog-text-cell">{item.zh}</TableCell>
              <TableCell className="catalog-text-cell">{item.es}</TableCell>
              <TableCell className="catalog-actions-cell">
                <Button size="sm" variant="outline" onClick={() => saveAttributes((value) => ({ ...value, attributes: moveSortedRow(value.attributes || [], item.id, -1) }))}><ChevronUp {...ICON_SM} /></Button>{" "}
                <Button size="sm" variant="outline" onClick={() => saveAttributes((value) => ({ ...value, attributes: moveSortedRow(value.attributes || [], item.id, 1) }))}><ChevronDown {...ICON_SM} /></Button>{" "}
                <Button size="sm" variant="outline" onClick={() => setModal({ type: "attribute", id: item.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => confirm(t("confirmDeleteAttribute")) && saveAttributes((value) => ({ ...value, attributes: value.attributes.filter((entry) => entry.id !== item.id) }))}><Trash2 {...ICON_SM} /> {t("delete")}</Button></TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={5}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function StaffPage({ data, saveData, deleteStaffRecord, filters, setFilters, setModal, session, toast, t }) {
  const rows = (data.users || []).filter((item) => [item.name, item.username, item.email].join(" ").toLowerCase().includes(filters.staffSearch.toLowerCase()));
  const page = paginate(rows, filters.staffPage);
  const remove = async (user) => {
    if (user.id === session?.id) return toast(t("currentUserCannotDelete"));
    if (user.isAdmin && data.users.filter((item) => item.isAdmin).length <= 1) return toast(t("lastAdminCannotDelete"));
    if (!confirm(t("confirmDeleteStaff"))) return;
    const ok = deleteStaffRecord
      ? await deleteStaffRecord(user.id)
      : await saveData((value) => ({ ...value, users: value.users.filter((item) => item.id !== user.id) }));
    if (ok) toast(t("saved"));
  };
  return (
    <section className="page">
      <Toolbar>
        <Button onClick={() => setModal({ type: "staff" })}><Plus {...ICON_SM} /> {t("add")}</Button>
        <SearchInput value={filters.staffSearch} onChange={(value) => setFilters({ ...filters, staffSearch: value, staffPage: 1 })} placeholder={t("search")} />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="staffPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <TableContainer>
        <Table>
          <TableHeader><TableRow><TableHead>{t("fullName")}</TableHead><TableHead>{t("staffUsername")}</TableHead><TableHead>{t("email")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}{user.isAdmin ? <Badge style={{ marginLeft: 8 }}>{t("admin")}</Badge> : null}</TableCell><TableCell>{user.username}</TableCell><TableCell>{user.email}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setModal({ type: "staff", id: user.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}
                <Button size="sm" variant="danger" onClick={() => remove(user)}><Trash2 {...ICON_SM} /> {t("delete")}</Button></TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={4}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function TechniciansPage({ data, saveData, saveNonRepairResource, filters, setFilters, setModal, toast, navigate, lang, t }) {
  const isMobileLayout = useMobileLayout();
  const allRows = technicianDashboardRows(data, t);
  const rows = allRows.filter((row) => row.name.toLowerCase().includes(filters.techniciansSearch.toLowerCase()));
  const page = paginate(rows, filters.techniciansPage);
  const saveTechnicians = (updater) => saveNonRepairResource ? saveNonRepairResource("technicians", updater) : saveData(updater);
  const remove = (technician) => {
    const isUsed = data.repairs.some((repair) => repair.technicianId === technician.id || (technician.name && repair.technicianName === technician.name));
    if (isUsed) return toast(t("cannotDeleteTechnician"));
    if (!confirm(t("confirmDeleteTechnician"))) return;
    saveTechnicians((value) => ({ ...value, technicians: (value.technicians || []).filter((item) => item.id !== technician.id) }));
  };
  const removeHistoricalRecords = async (row) => {
    if (!isDeletableHistoricalTechnicianRow(row, t)) return;
    if (!confirm(t("confirmDeleteHistoricalRecords"))) return;
    const ok = await saveData((value) => {
      const valueTechnicianById = new Map((value.technicians || []).map((technician) => [technician.id, technician]));
      return {
        ...value,
        repairs: (value.repairs || []).filter((repair) => !repairMatchesTechnicianKey(repair, row.id, valueTechnicianById))
      };
    });
    if (ok) toast(t("historicalRecordsDeleted"));
  };
  return (
    <section className="page technicians-page">
      <Toolbar className="technicians-toolbar">
        <Button onClick={() => setModal({ type: "technician" })}><Plus {...ICON_SM} /> {t("add")}</Button>
        <SearchInput value={filters.techniciansSearch} onChange={(value) => setFilters({ ...filters, techniciansSearch: value, techniciansPage: 1 })} placeholder={t("search")} />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="techniciansPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      {isMobileLayout ? (
        <div className="mobile-technician-dashboard-list" data-smoke="mobile-technicians-list">
          {page.items.length ? page.items.map((row) => (
            <MobileTechnicianDashboardCard
              key={row.id}
              row={row}
              navigate={navigate}
              lang={lang}
              t={t}
              onMoveUp={row.technician ? () => saveTechnicians((value) => ({ ...value, technicians: moveSortedRow(value.technicians || [], row.technician.id, -1) })) : null}
              onMoveDown={row.technician ? () => saveTechnicians((value) => ({ ...value, technicians: moveSortedRow(value.technicians || [], row.technician.id, 1) })) : null}
              onEdit={row.technician ? () => setModal({ type: "technician", id: row.technician.id }) : null}
              onDelete={row.technician ? () => remove(row.technician) : isDeletableHistoricalTechnicianRow(row, t) ? () => removeHistoricalRecords(row) : null}
            />
          )) : <Empty>{t("noData")}</Empty>}
        </div>
      ) : null}
      <TableContainer className="desktop-technicians-table">
        <Table className="technicians-table">
          <TableHeader><TableRow><TableHead>{t("assignedTechnician")}</TableHead><TableHead>{t("repairRecords")}</TableHead><TableHead>{t("latestRepair")}</TableHead><TableHead>{t("technicianRepairOrders")}</TableHead><TableHead>{t("technicianWarrantyOrders")}</TableHead><TableHead>{t("technicianOpenOrders")}</TableHead><TableHead>{t("technicianRepairRevenue")}</TableHead><TableHead>{t("technicianRepairProfit")}</TableHead><TableHead>{t("technicianWarrantyLoss")}</TableHead><TableHead>{t("operation")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((row) => (
            <TableRow key={row.id} className={`row-click ${row.isUnassigned ? "technician-row-unassigned" : ""}`} onClick={() => navigate(`/dashboard/technicians/${encodeURIComponent(row.id)}`)}>
              <TableCell><div className="technician-name-cell"><TechnicianColorDot technician={row.technician} /><b>{row.name}</b></div></TableCell>
              <TableCell className="count-cell"><TextLink className="client-record-toggle" href={`#/dashboard/technicians/${encodeURIComponent(row.id)}`} onClick={(event) => event.stopPropagation()}>{row.recordCount} {t("times")}{row.openCount ? ` · ${row.openCount} ${t("unfinished")}` : ""}</TextLink></TableCell>
              <TableCell className="technician-latest-cell">{row.latestRepair ? <TextLink className="client-latest-order" href={`#/dashboard/repairs/${row.latestRepair.id}`} onClick={(event) => event.stopPropagation()}>{row.latestRepair.brand || ""} {row.latestRepair.model || ""} · {statusLabel(row.latestRepair.status, lang)}</TextLink> : "-"}</TableCell>
              <TableCell className="count-cell">{row.repairCount}</TableCell>
              <TableCell className="count-cell">{row.warrantyCount}</TableCell>
              <TableCell className="count-cell">{row.openCount}</TableCell>
              <TableCell className="money-cell">{money(row.repairAmount)}</TableCell>
              <TableCell className={`money-cell ${row.repairProfit < 0 ? "negative" : ""}`}>{money(row.repairProfit)}</TableCell>
              <TableCell className={`money-cell ${row.warrantyLoss > 0 ? "negative" : ""}`}>{money(row.warrantyLoss)}</TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>{row.technician ? <><Button size="sm" variant="outline" onClick={() => saveTechnicians((value) => ({ ...value, technicians: moveSortedRow(value.technicians || [], row.technician.id, -1) }))}><ChevronUp {...ICON_SM} /></Button>{" "}<Button size="sm" variant="outline" onClick={() => saveTechnicians((value) => ({ ...value, technicians: moveSortedRow(value.technicians || [], row.technician.id, 1) }))}><ChevronDown {...ICON_SM} /></Button>{" "}<Button size="sm" variant="outline" onClick={() => setModal({ type: "technician", id: row.technician.id })}><Pencil {...ICON_SM} /> {t("edit")}</Button>{" "}<Button size="sm" variant="danger" onClick={() => remove(row.technician)}><Trash2 {...ICON_SM} /> {t("delete")}</Button></> : isDeletableHistoricalTechnicianRow(row, t) ? <Button size="sm" variant="danger" onClick={() => removeHistoricalRecords(row)}><Trash2 {...ICON_SM} /> {t("deleteHistoricalRecords")}</Button> : <span className="muted-inline">-</span>}</TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={10}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function TechnicianOrdersPage({ data, technicianKey, navigate, filters, setFilters, lang, t }) {
  const isMobileLayout = useMobileLayout();
  const decodedKey = technicianKey || "";
  const technicians = data.technicians || [];
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);
  const technician = decodedKey.startsWith("id:") ? technicianById.get(decodedKey.slice(3)) : null;
  const legacyName = decodedKey.startsWith("name:") ? decodedKey.slice(5) : "";
  const title = technician?.name || legacyName || (decodedKey === "unassigned" ? t("unassignedTechnician") : t("historicalTechnician"));
  const clients = new Map((data.clients || []).map((client) => [client.id, client]));
  const startDate = filters.technicianOrdersStartDate || "";
  const endDate = filters.technicianOrdersEndDate || "";
  const orders = (data.repairs || [])
    .filter((repair) => repairMatchesTechnicianKey(repair, decodedKey, technicianById))
    .sort((a, b) => String(b.repairTime || b.ticket || "").localeCompare(String(a.repairTime || a.ticket || "")));
  const filteredOrders = orders.filter((repair) => {
    const day = String(repair.repairTime || "").slice(0, 10);
    return (!startDate || day >= startDate) && (!endDate || day <= endDate);
  });
  const page = paginate(filteredOrders, filters.technicianOrdersPage);
  const businessFilteredOrders = filteredOrders.filter((repair) => !isCanceledRepair(repair));
  const totals = businessFilteredOrders.reduce((sum, repair) => {
    const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
    const amount = skipAmount ? 0 : chargeAmount(repair);
    const cost = skipAmount ? 0 : repairCostAmount(repair);
    return {
      amount: sum.amount + amount,
      cost: sum.cost + cost,
      profit: sum.profit + amount - cost,
      open: sum.open + (isLockingFinalStatus(normalizeStatus(repair.status)) ? 0 : 1)
    };
  }, { amount: 0, cost: 0, profit: 0, open: 0 });
  const updateDate = (key, value) => {
    const next = { ...filters, [key]: value, technicianOrdersPage: 1 };
    if (key === "technicianOrdersStartDate" && next.technicianOrdersEndDate && value > next.technicianOrdersEndDate) next.technicianOrdersEndDate = value;
    if (key === "technicianOrdersEndDate" && next.technicianOrdersStartDate && value < next.technicianOrdersStartDate) next.technicianOrdersStartDate = value;
    setFilters(next);
  };
  const clearDate = () => setFilters({ ...filters, technicianOrdersStartDate: "", technicianOrdersEndDate: "", technicianOrdersPage: 1 });
  return (
    <section className="page technician-orders-page">
      <Toolbar className="technician-orders-toolbar">
        <Button variant="outline" onClick={() => navigate("/dashboard/technicians")}><ChevronLeft {...ICON_SM} /> {t("backToTechnicians")}</Button>
        <div className="technician-orders-title">
          <b>{title}</b>
          <span>{filteredOrders.length} {t("orders")} / {orders.length} {t("orders")}</span>
        </div>
        <DateRangeFilter
          lang={lang}
          t={t}
          start={startDate}
          end={endDate}
          onStartChange={(value) => updateDate("technicianOrdersStartDate", value)}
          onEndChange={(value) => updateDate("technicianOrdersEndDate", value)}
          onClear={clearDate}
          showPresets={false}
        />
        <div className="toolbar-spacer" />
        <Pagination page={page} pageKey="technicianOrdersPage" filters={filters} setFilters={setFilters} t={t} />
      </Toolbar>
      <div className="metric-grid technician-orders-summary-grid">
        <Metric title={t("orderCount")} value={businessFilteredOrders.length} />
        <Metric title={t("repairAmount")} value={money(totals.amount)} />
        <Metric title={t("costAmount")} value={money(totals.cost)} />
        <Metric title={t("profitAmount")} value={money(totals.profit)} />
      </div>
      {isMobileLayout ? (
        <div className="mobile-order-card-list technician-orders-mobile-list" data-smoke="mobile-technician-order-cards">
          {page.items.length ? page.items.map((repair) => {
            const client = clients.get(repair.clientId) || EMPTY_CLIENT;
            const amount = chargeAmount(repair);
            const cost = repairCostAmount(repair);
            const profit = amount - cost;
            const isWarranty = repair.orderType === "warranty";
            const route = isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`;
            return (
              <MobileRepairCard
                key={repair.id}
                repair={repair}
                client={client}
                amount={amount}
                cost={cost}
                profit={profit}
                technician={technicianById.get(repair.technicianId)}
                technicianOptions={technicians}
                route={route}
                navigate={navigate}
                lang={lang}
                t={t}
                readonly
              />
            );
          }) : <Empty>{t("noData")}</Empty>}
        </div>
      ) : null}
      <TableContainer className="desktop-orders-table">
        <Table className="repairs-table technician-orders-table">
          <TableHeader><TableRow><TableHead>{t("ticket")}</TableHead><TableHead>{t("clientName")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("brandModel")}</TableHead><TableHead>{t("issue")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("orderDate")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("costAmount")}</TableHead><TableHead>{t("profitAmount")}</TableHead></TableRow></TableHeader>
          <TableBody>{page.items.length ? page.items.map((repair) => {
            const client = clients.get(repair.clientId) || EMPTY_CLIENT;
            const amount = chargeAmount(repair);
            const cost = repairCostAmount(repair);
            const profit = amount - cost;
            const isWarranty = repair.orderType === "warranty";
            const repairRoute = isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`;
            const contentLabel = repairContentLabel(repair, lang);
            return (
              <TableRow key={repair.id} className={`row-click ${isWarranty ? "order-row-warranty" : "order-row-repair"}`} onClick={() => navigate(repairRoute)}>
                <TableCell data-label={t("ticket")}><div className="ticket-cell"><span>{repair.ticket}</span><OrderTypeBadge repair={repair} t={t} /></div></TableCell>
                <TableCell data-label={t("clientName")}>{client.name}</TableCell>
                <TableCell data-label={t("phone")}>{client.phone}</TableCell>
                <TableCell data-label={t("brandModel")}>{repair.brand} / {repair.model}</TableCell>
                <TableCell data-label={t("issue")} className="repair-issue-cell"><span title={contentLabel}>{contentLabel}</span></TableCell>
                <TableCell data-label={t("status")}><StatusPill status={normalizeStatus(repair.status)} lang={lang} /></TableCell>
                <TableCell data-label={t("orderDate")}>{formatDateTimeDisplay(repair.repairTime, lang)}</TableCell>
                <TableCell data-label={t("total")} className="money-cell">{money(amount)}</TableCell>
                <TableCell data-label={t("costAmount")} className="money-cell">{money(cost)}</TableCell>
                <TableCell data-label={t("profitAmount")} className={`money-cell ${profit < 0 ? "negative" : ""}`}>{money(profit)}</TableCell>
              </TableRow>
            );
          }) : <TableRow><TableCell colSpan={10}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

function ReportsPage({ data, filters, setFilters, navigate, lang, t }) {
  const range = reportRange(filters.reportPreset, filters.reportStart, filters.reportEnd);
  const technicianById = useMemo(() => new Map((data.technicians || []).map((technician) => [technician.id, technician])), [data.technicians]);
  const technicianByName = useMemo(() => technicianNameLookup(data.technicians || []), [data.technicians]);
  const orders = data.repairs.filter((repair) => {
    if (isCanceledRepair(repair)) return false;
    const day = String(repair.repairTime || "").slice(0, 10);
    return (!range.start || day >= range.start) && (!range.end || day <= range.end);
  });
  const repairs = orders.filter((repair) => (repair.orderType || "repair") !== "warranty");
  const warranties = orders.filter((repair) => repair.orderType === "warranty");
  const amount = (repair) => isHistoricalAmountRepair(repair, technicianById, technicianByName) ? 0 : chargeAmount(repair);
  const cost = (repair) => isHistoricalAmountRepair(repair, technicianById, technicianByName) ? 0 : repairCostAmount(repair);
  const revenue = orders.reduce((sum, repair) => sum + amount(repair), 0);
  const costTotal = orders.reduce((sum, repair) => sum + cost(repair), 0);
  const profit = revenue - costTotal;
  const received = orders.reduce((sum, repair) => sum + Math.min(amount(repair), repairPaidAmount(repair)), 0);
  const unpaid = orders.reduce((sum, repair) => sum + Math.max(0, amount(repair) - repairPaidAmount(repair)), 0);
  const topModels = topBy(orders, (repair) => repair.model || t("unset"), amount, { limit: 0 });
  const technicianRows = technicianStats(orders, data.technicians || [], amount, cost, t);
  const trendGranularity = filters.reportTrendGranularity || "day";
  const trendMetric = filters.reportTrendMetric || "both";
  const trendRows = revenueTrendRows(orders, amount, trendGranularity);
  const openTechnicianOrders = (row) => {
    setFilters({
      ...filters,
      technicianOrdersStartDate: range.start,
      technicianOrdersEndDate: range.end,
      technicianOrdersPage: 1
    });
    navigate(`/dashboard/technicians/${encodeURIComponent(row.id)}`);
  };
  const updatePreset = (value) => {
    if (value === "custom") {
      setFilters({
        ...filters,
        reportPreset: value,
        reportStart: filters.reportStart || range.start,
        reportEnd: filters.reportEnd || range.end
      });
      return;
    }
    setFilters({ ...filters, reportPreset: value });
  };
  const updateDate = (key, value) => {
    const next = {
      ...filters,
      reportPreset: "custom",
      reportStart: filters.reportStart || range.start,
      reportEnd: filters.reportEnd || range.end,
      [key]: value
    };
    if (key === "reportStart" && next.reportEnd && value > next.reportEnd) next.reportEnd = value;
    if (key === "reportEnd" && next.reportStart && value < next.reportStart) next.reportStart = value;
    setFilters(next);
  };
  const clearDateRange = () => setFilters({ ...filters, reportPreset: "custom", reportStart: "", reportEnd: "" });
  return (
    <section className="page">
      <Toolbar className="report-toolbar">
        <DateRangeFilter
          lang={lang}
          t={t}
          start={range.start}
          end={range.end}
          preset={filters.reportPreset}
          onStartChange={(value) => updateDate("reportStart", value)}
          onEndChange={(value) => updateDate("reportEnd", value)}
          onPreset={updatePreset}
          onClear={clearDateRange}
        />
      </Toolbar>
      {technicianRows.length ? (
        <Card className="report-wide-card">
          <CardHeader><CardTitle>{t("technicianPerformance")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>{t("assignedTechnician")}</TableHead><TableHead>{t("orderCount")}</TableHead><TableHead>{t("repairAmount")}</TableHead><TableHead>{t("costAmount")}</TableHead><TableHead>{t("profitAmount")}</TableHead><TableHead>{t("receivedAmount")}</TableHead><TableHead>{t("unpaidAmount")}</TableHead></TableRow></TableHeader>
              <TableBody>{technicianRows.map((row) => (
                <TableRow key={row.id} className={`row-click ${row.id === "unassigned" ? "technician-row-unassigned" : ""}`} onClick={() => openTechnicianOrders(row)}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>{money(row.amount)}</TableCell>
                  <TableCell>{money(row.cost)}</TableCell>
                  <TableCell>{money(row.profit)}</TableCell>
                  <TableCell>{money(row.received)}</TableCell>
                  <TableCell>{money(row.unpaid)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <div className="metric-grid">
        <Metric title={t("monthRevenue")} value={money(revenue)} />
        <Metric title={t("repairCount")} value={repairs.length} />
        <Metric title={t("warrantyCount")} value={warranties.length} />
        <Metric title={t("costAmount")} value={money(costTotal)} />
        <Metric title={t("profitAmount")} value={money(profit)} />
        <Metric title={t("unpaidAmount")} value={money(unpaid)} />
      </div>
      {trendRows.length ? (
        <Card className="report-wide-card">
          <CardHeader>
            <CardTitle>{t("revenueTrend")}</CardTitle>
            <div className="report-trend-controls">
              <Select value={trendGranularity} onChange={(event) => setFilters({ ...filters, reportTrendGranularity: event.target.value })}>
                <option value="day">{t("trendDaily")}</option>
                <option value="week">{t("trendWeekly")}</option>
                <option value="month">{t("trendMonthly")}</option>
              </Select>
              <Select value={trendMetric} onChange={(event) => setFilters({ ...filters, reportTrendMetric: event.target.value })}>
                <option value="both">{t("trendMetricBoth")}</option>
                <option value="amount">{t("trendMetricAmount")}</option>
                <option value="orders">{t("trendMetricOrders")}</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent><RevenueTrendChart rows={trendRows} metric={trendMetric} t={t} /></CardContent>
        </Card>
      ) : null}
      {topModels.length ? (
        <div className="report-grid">
          <ReportTable title={t("topModels")} rows={topModels} t={t} variant="rank-grid" />
        </div>
      ) : null}
    </section>
  );
}

function FinancePage({ data, filters, setFilters, navigate, lang, t }) {
  const repairs = data.repairs || [];
  const clients = data.clients || [];
  const range = reportRange(filters.financePreset, filters.financeStart, filters.financeEnd);
  const search = (filters.financeSearch || "").trim().toLowerCase();
  const clientLookup = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const technicianById = useMemo(() => new Map((data.technicians || []).map((technician) => [technician.id, technician])), [data.technicians]);
  const technicianByName = useMemo(() => technicianNameLookup(data.technicians || []), [data.technicians]);
  const finance = useMemo(() => {
    const paymentRows = [];
    const unpaidRows = [];
    let receivable = 0;
    let costTotal = 0;
    let received = 0;
    let unpaid = 0;
    const matchesSearch = (...values) => {
      if (!search) return true;
      return values.join(" ").toLowerCase().includes(search);
    };

    for (const repair of repairs) {
      const client = clientLookup.get(repair.clientId) || EMPTY_CLIENT;
      const ticket = repair.ticket || "-";
      const businessOrder = !isCanceledRepair(repair);
      const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
      const orderInRange = businessOrder && dateInRange(repair.repairTime || repair.createdAt, range.start, range.end);
      if (orderInRange && !skipAmount) {
        const total = chargeAmount(repair);
        const paid = repairPaidAmount(repair);
        const cost = repairCostAmount(repair);
        const due = Math.max(0, total - paid);
        receivable += total;
        costTotal += cost;
        unpaid += due;
        if (due > 0.005 && matchesSearch(ticket, client.name, client.phone, repair.brand, repair.model, repair.issue)) {
          unpaidRows.push({ repair, client, total, paid, cost, due });
        }
      }

      if (!businessOrder || skipAmount) continue;
      for (const payment of repairPaymentsForDisplay(repair, t)) {
        const paidAt = payment.paidAt || repair.repairTime || repair.createdAt;
        if (!dateInRange(paidAt, range.start, range.end)) continue;
        if (!matchesSearch(ticket, client.name, client.phone, payment.note)) continue;
        const amount = Number(payment.amount || 0);
        received += amount;
        paymentRows.push({
          ...payment,
          paidAt,
          repair,
          client,
          ticket,
          clientName: client.name || "-",
          clientPhone: client.phone || ""
        });
      }
    }

    paymentRows.sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")));
    unpaidRows.sort((a, b) => b.due - a.due);
    return {
      paymentRows,
      unpaidRows,
      receivable,
      costTotal,
      received,
      unpaid
    };
  }, [repairs, clientLookup, technicianById, technicianByName, range.start, range.end, search, t]);
  const paymentPage = paginate(finance.paymentRows, filters.financePaymentsPage, FINANCE_PAGE_SIZE);
  const unpaidPage = paginate(finance.unpaidRows, filters.financeUnpaidPage, FINANCE_PAGE_SIZE);
  const daily = useMemo(() => {
    const todayKey = dateOnly(new Date());
    let collected = 0;
    let depositCollected = 0;
    let finalCollected = 0;
    let paymentCount = 0;
    let orderCount = 0;
    let unpaid = 0;
    let cost = 0;
    let profit = 0;
    for (const repair of repairs) {
      const orderDay = String(repair.repairTime || repair.createdAt || "").slice(0, 10);
      const businessOrder = !isCanceledRepair(repair);
      const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
      if (orderDay === todayKey && businessOrder) {
        orderCount += 1;
        if (!skipAmount) {
          const total = chargeAmount(repair);
          const orderCost = repairCostAmount(repair);
          unpaid += Math.max(0, total - repairPaidAmount(repair));
          cost += orderCost;
          profit += total - orderCost;
        }
      }
      if (!businessOrder || skipAmount) continue;
      for (const payment of repairPaymentsForDisplay(repair, t)) {
        const paidAt = payment.paidAt || repair.repairTime || repair.createdAt;
        if (dateInRange(paidAt, todayKey, todayKey)) {
          const amount = Number(payment.amount || 0);
          collected += amount;
          paymentCount += 1;
          const note = String(payment.note || "").toLowerCase();
          if (note.includes("订金") || note.includes("depósito") || note.includes("deposito")) depositCollected += amount;
          if (note.includes("尾款") || note.includes("pago final")) finalCollected += amount;
        }
      }
    }
    return { collected, depositCollected, finalCollected, paymentCount, orderCount, unpaid, cost, profit };
  }, [repairs, technicianById, technicianByName, t]);
  const updatePreset = (value) => {
    if (value === "custom") {
      setFilters({
        ...filters,
        financePreset: value,
        financeStart: filters.financeStart || range.start,
        financeEnd: filters.financeEnd || range.end,
        financePaymentsPage: 1,
        financeUnpaidPage: 1
      });
      return;
    }
    setFilters({ ...filters, financePreset: value, financePaymentsPage: 1, financeUnpaidPage: 1 });
  };
  const updateDate = (key, value) => {
    const next = {
      ...filters,
      financePreset: "custom",
      financeStart: filters.financeStart || range.start,
      financeEnd: filters.financeEnd || range.end,
      financePaymentsPage: 1,
      financeUnpaidPage: 1,
      [key]: value
    };
    if (key === "financeStart" && next.financeEnd && value > next.financeEnd) next.financeEnd = value;
    if (key === "financeEnd" && next.financeStart && value < next.financeStart) next.financeStart = value;
    setFilters(next);
  };
  const clearDateRange = () => setFilters({ ...filters, financePreset: "custom", financeStart: "", financeEnd: "", financePaymentsPage: 1, financeUnpaidPage: 1 });
  return (
    <section className="page finance-page">
      <Card className="daily-business-card">
        <CardHeader><CardTitle>{t("dailyBusiness")}</CardTitle></CardHeader>
        <CardContent>
          <div className="daily-business-grid">
            <div className="daily-collected-card">
              <span>{t("dailyCollected")}</span>
              <b>{money(daily.collected)}</b>
              <div className="daily-payment-split">
                <small>{t("dailyDepositCollected")} <strong>{money(daily.depositCollected)}</strong></small>
                <small>{t("dailyFinalCollected")} <strong>{money(daily.finalCollected)}</strong></small>
              </div>
            </div>
            <div><span>{t("dailyOrders")}</span><b>{daily.orderCount}</b></div>
            <div><span>{t("dailyUnpaid")}</span><b>{money(daily.unpaid)}</b></div>
            <div><span>{t("dailyCost")}</span><b>{money(daily.cost)}</b></div>
            <div><span>{t("dailyProfit")}</span><b className={daily.profit < 0 ? "negative" : ""}>{money(daily.profit)}</b></div>
            <div><span>{t("dailyPaymentCount")}</span><b>{daily.paymentCount}</b></div>
          </div>
        </CardContent>
      </Card>
      <Toolbar className="report-toolbar finance-toolbar">
        <DateRangeFilter
          lang={lang}
          t={t}
          start={range.start}
          end={range.end}
          preset={filters.financePreset}
          onStartChange={(value) => updateDate("financeStart", value)}
          onEndChange={(value) => updateDate("financeEnd", value)}
          onPreset={updatePreset}
          onClear={clearDateRange}
        />
        <SearchInput value={filters.financeSearch || ""} onChange={(value) => setFilters({ ...filters, financeSearch: value, financePaymentsPage: 1, financeUnpaidPage: 1 })} placeholder={t("search")} />
      </Toolbar>
      <div className="metric-grid">
        <Metric title={t("financeReceivable")} value={money(finance.receivable)} />
        <Metric title={t("financeReceived")} value={money(finance.received)} />
        <Metric title={t("unpaidAmount")} value={money(finance.unpaid)} />
        <Metric title={t("financeCost")} value={money(finance.costTotal)} />
        <Metric title={t("financeProfit")} value={money(finance.receivable - finance.costTotal)} />
        <Metric title={t("paymentCount")} value={finance.paymentRows.length} />
      </div>
      <div className="finance-grid">
        <Card className="finance-main-card">
          <CardHeader><CardTitle>{t("paymentRecords")}</CardTitle></CardHeader>
          <CardContent>
            <TablePagination page={paymentPage} pageKey="financePaymentsPage" filters={filters} setFilters={setFilters} t={t} />
            <TableContainer>
              <Table className="finance-table">
                <TableHeader><TableRow><TableHead>{t("paymentDate")}</TableHead><TableHead>{t("ticket")}</TableHead><TableHead>{t("clientName")}</TableHead><TableHead>{t("paymentAmount")}</TableHead><TableHead>{t("paymentNote")}</TableHead><TableHead>{t("actions")}</TableHead></TableRow></TableHeader>
                <TableBody>{paymentPage.items.length ? paymentPage.items.map((payment) => (
                  <TableRow key={`${payment.repair.id}-${payment.id}`}>
                    <TableCell>{formatPaymentDate(payment.paidAt, lang)}</TableCell>
                    <TableCell>{payment.ticket}</TableCell>
                    <TableCell>{payment.clientName}</TableCell>
                    <TableCell className="money-cell">{money(payment.amount)}</TableCell>
                    <TableCell>{paymentDisplayNote(payment, t, lang) || "-"}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/repairs/${payment.repair.id}`)}>{t("edit")}</Button></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6}><Empty>{t("noPayments")}</Empty></TableCell></TableRow>}</TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="report-wide-card">
        <CardHeader><CardTitle>{t("unpaidOrders")}</CardTitle></CardHeader>
        <CardContent>
          <TablePagination page={unpaidPage} pageKey="financeUnpaidPage" filters={filters} setFilters={setFilters} t={t} />
          <TableContainer>
            <Table className="finance-table">
              <TableHeader><TableRow><TableHead>{t("ticket")}</TableHead><TableHead>{t("clientName")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("paidAmount")}</TableHead><TableHead>{t("due")}</TableHead><TableHead>{t("actions")}</TableHead></TableRow></TableHeader>
              <TableBody>{unpaidPage.items.length ? unpaidPage.items.map((row) => (
                <TableRow key={row.repair.id}>
                  <TableCell>{row.repair.ticket}</TableCell>
                  <TableCell>{row.client.name || "-"}</TableCell>
                  <TableCell>{row.client.phone || "-"}</TableCell>
                  <TableCell><StatusPill status={row.repair.status} lang={lang} /></TableCell>
                  <TableCell className="money-cell">{money(row.total)}</TableCell>
                  <TableCell className="money-cell">{money(row.paid)}</TableCell>
                  <TableCell className="money-cell negative">{money(row.due)}</TableCell>
                  <TableCell><Button size="sm" onClick={() => navigate(`/dashboard/repairs/${row.repair.id}`)}>{t("paid")}</Button></TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={8}><Empty>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </section>
  );
}

function SettingsPage({ data, saveSettingsOnly, toast, t }) {
  const settingsKey = useMemo(() => stableStringify(data.settings || {}), [data.settings]);
  const [draftSettings, setDraftSettings] = useState(() => data.settings || {});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraftSettings(data.settings || {});
  }, [settingsKey]);
  const update = (key, value) => setDraftSettings((current) => ({ ...(current || {}), [key]: value }));
  const saveSettings = async () => {
    setSaving(true);
    try {
      const ok = await saveSettingsOnly(draftSettings || {});
      if (ok) toast(t("settingsSaved"));
    } finally {
      setSaving(false);
    }
  };
  const settings = draftSettings || {};
  return (
    <section className="page">
      <Card><CardHeader><CardTitle>{t("settings")}</CardTitle></CardHeader><CardContent>
        <div className="settings-sections">
          <fieldset className="fieldset-card settings-fieldset">
            <legend>{t("businessInfo")}</legend>
            <FieldGroup>
              <LabeledField className="col-4"><span>{t("shopName")}</span><Input value={settings.shopName || ""} onChange={(event) => update("shopName", event.target.value)} placeholder={t("shopName")} /></LabeledField>
              <LabeledField className="col-5"><span>{t("shopAddress")}</span><Input value={settings.shopAddress || ""} onChange={(event) => update("shopAddress", event.target.value)} placeholder={t("shopAddress")} /></LabeledField>
              <LabeledField className="col-3"><span>{t("shopTaxId")}</span><Input value={settings.shopTaxId || ""} onChange={(event) => update("shopTaxId", event.target.value)} placeholder={t("shopTaxId")} /></LabeledField>
              <LabeledField className="col-6"><span>{t("contactPhone")}</span><Input value={settings.phone || ""} onChange={(event) => update("phone", event.target.value)} placeholder={t("contactPhone")} /></LabeledField>
            </FieldGroup>
          </fieldset>

          <fieldset className="fieldset-card settings-fieldset">
            <legend>{t("printSettings")}</legend>
            <FieldGroup>
              <LabeledField className="col-12"><span>{t("publicBaseUrl")}</span><Input value={settings.publicBaseUrl || ""} onChange={(event) => update("publicBaseUrl", event.target.value)} placeholder={t("publicBaseUrlPlaceholder")} /></LabeledField>
              <LabeledField className="col-12"><span>{t("whatsappTemplate")}</span><Textarea value={whatsappTemplateValue(settings)} onChange={(event) => update("whatsappProgressTemplate", event.target.value)} placeholder={t("whatsappTemplatePlaceholder")} /></LabeledField>
              <LabeledField className="col-3"><span>{t("taxRate")}</span><Input type="number" value={settings.taxRate ?? 21} onChange={(event) => update("taxRate", Number(event.target.value || 0))} placeholder={t("taxRate")} /></LabeledField>
              <LabeledField className="col-3"><span>{t("printLanguage")}</span><Select value={settings.printLanguage || "zh"} onChange={(event) => update("printLanguage", event.target.value)}>{languages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></LabeledField>
              <LabeledField className="col-3"><span>{t("scanShortcut")}</span><Select value={settings.scanShortcut || "F2"} onChange={(event) => update("scanShortcut", event.target.value)}>{scanShortcutOptions.map((item) => <option key={item} value={item}>{scanShortcutLabel(item)}</option>)}</Select></LabeledField>
              <LabeledField className="col-3"><span>{t("defaultWarrantyDuration")}</span><Input type="number" min="1" step="1" value={warrantyDays(settings)} onChange={(event) => update("defaultWarrantyDays", Number(event.target.value || 90))} placeholder="90" /></LabeledField>
              <CheckboxLine className="col-12"><Checkbox checked={Boolean(settings.hideIssuer)} onChange={(event) => update("hideIssuer", event.target.checked)} /> {t("hideIssuer")}</CheckboxLine>
              <CheckboxLine className="col-12"><Checkbox checked={settings.enableOrderLock !== false} onChange={(event) => update("enableOrderLock", event.target.checked)} /> {t("enableOrderLock")}</CheckboxLine>
              <CheckboxLine className="col-12"><Checkbox checked={settings.allowOrderUnlock !== false} onChange={(event) => update("allowOrderUnlock", event.target.checked)} /> {t("allowOrderUnlock")}</CheckboxLine>
            </FieldGroup>
          </fieldset>

          <fieldset className="fieldset-card settings-fieldset">
            <legend>{t("displayControls")}</legend>
            <FieldGroup>
              <CheckboxLine className="col-6"><Checkbox checked={settings.showPasswordSection !== false} onChange={(event) => update("showPasswordSection", event.target.checked)} /> {t("showPasswordSection")}</CheckboxLine>
              <CheckboxLine className="col-6"><Checkbox checked={settings.showPhotoSection !== false} onChange={(event) => update("showPhotoSection", event.target.checked)} /> {t("showPhotoSection")}</CheckboxLine>
              <CheckboxLine className="col-6"><Checkbox checked={settings.showSignatureSection !== false} onChange={(event) => update("showSignatureSection", event.target.checked)} /> {t("showSignatureSection")}</CheckboxLine>
              <CheckboxLine className="col-6"><Checkbox checked={settings.showQrNoticeSection !== false} onChange={(event) => update("showQrNoticeSection", event.target.checked)} /> {t("showQrNoticeSection")}</CheckboxLine>
            </FieldGroup>
          </fieldset>

          <fieldset className="fieldset-card settings-fieldset">
            <legend>{t("termsTemplates")}</legend>
            <FieldGroup className="settings-terms-grid">
              <LabeledField className="col-12"><span>{t("reservationTerms")}</span><Textarea value={settings.reservationTerms || ""} onChange={(event) => update("reservationTerms", event.target.value)} placeholder={t("reservationTerms")} /></LabeledField>
              <LabeledField className="col-12"><span>{t("repairTerms")}</span><Textarea value={settings.repairTerms || ""} onChange={(event) => update("repairTerms", event.target.value)} placeholder={t("repairTerms")} /></LabeledField>
              <LabeledField className="col-12"><span>{t("warrantyTerms")}</span><Textarea value={settings.warrantyTerms || ""} onChange={(event) => update("warrantyTerms", event.target.value)} placeholder={t("warrantyTerms")} /></LabeledField>
            </FieldGroup>
          </fieldset>
        </div>
        <div className="settings-actions"><Button onClick={saveSettings} disabled={saving}>{t("save")}</Button></div>
      </CardContent></Card>
    </section>
  );
}

function BackupPage({ data, bootstrap, toast, t }) {
  const [text, setText] = useState("");
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [externalHistoryFile, setExternalHistoryFile] = useState(null);
  const [externalAmountStartDate, setExternalAmountStartDate] = useState("");
  const [externalAmountEndDate, setExternalAmountEndDate] = useState("");
  const [externalImportSummary, setExternalImportSummary] = useState(null);
  const [externalImportProgress, setExternalImportProgress] = useState({ active: false, percent: 0, label: "" });
  const fileInputRef = useRef(null);
  const externalProgressTimerRef = useRef(null);

  useEffect(() => {
    loadBackups();
    return () => {
      if (externalProgressTimerRef.current) window.clearInterval(externalProgressTimerRef.current);
    };
  }, []);

  async function loadBackups() {
    const payload = await apiGet("/api/backup/list");
    setBackups(payload.backups || []);
  }

  const exportData = async () => {
    const payload = await apiGet("/api/backup/export");
    setText(JSON.stringify(payload, null, 2));
    toast(t("backupExported"));
  };
  const downloadCurrent = async () => {
    setBusy(true);
    try {
      await downloadFromUrl("/api/backup/download/current", `repairnote-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`);
      toast(t("backupDownloaded"));
    } finally {
      setBusy(false);
    }
  };
  const createBackup = async () => {
    setBusy(true);
    try {
      await apiJson("/api/backup/create", "POST", {});
      await loadBackups();
      toast(t("backupCreated"));
    } finally {
      setBusy(false);
    }
  };
  const restoreBackup = async (id) => {
    if (!window.confirm(t("confirmRestoreBackup"))) return;
    setBusy(true);
    try {
      await apiJson("/api/backup/restore", "POST", { id });
      await bootstrap();
      await loadBackups();
      toast(t("backupRestored"));
    } finally {
      setBusy(false);
    }
  };
  const downloadBackup = async (id) => {
    setBusy(true);
    try {
      await downloadFromUrl(`/api/backup/download/${id}`, "repairnote-backup.zip");
      toast(t("backupDownloaded"));
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiFormData("/api/backup/import-file", "POST", form);
      await bootstrap();
      await loadBackups();
      toast(t("backupFileImported"));
    } catch (error) {
      toast(error.message || t("invalidBackupFile"));
    } finally {
      setBusy(false);
    }
  };
  const importData = async () => {
    if (!text.trim()) return toast(t("pasteJsonFirst"));
    const parsed = safeParse(text, null);
    const data = parsed?.data || parsed;
    if (!data || !Array.isArray(data.clients) || !Array.isArray(data.repairs)) return toast(t("invalidBackup"));
    await apiJson("/api/backup/import", "POST", parsed);
    await bootstrap();
    await loadBackups();
    toast(t("backupImported"));
  };
  const importLocal = async () => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (!local) return toast(t("noOldData"));
    const result = await apiJson("/api/import/local-storage", "POST", safeParse(local, {}));
    await bootstrap();
    toast(t("importedRepairs", { count: result.counts.repairs }));
  };
  const clearExternalImportTimer = () => {
    if (!externalProgressTimerRef.current) return;
    window.clearInterval(externalProgressTimerRef.current);
    externalProgressTimerRef.current = null;
  };
  const startExternalImportProgress = () => {
    clearExternalImportTimer();
    setExternalImportProgress({ active: true, percent: 8, label: t("externalHistoryProgressUploading") });
    externalProgressTimerRef.current = window.setInterval(() => {
      setExternalImportProgress((current) => {
        if (!current.active) return current;
        const nextPercent = Math.min(current.percent + (current.percent < 40 ? 4 : current.percent < 70 ? 2 : 1), 88);
        return {
          active: true,
          percent: nextPercent,
          label: nextPercent < 32 ? t("externalHistoryProgressUploading") : t("externalHistoryProgressProcessing")
        };
      });
    }, 900);
  };
  const updateExternalImportProgress = (percent, label) => {
    setExternalImportProgress({ active: true, percent, label });
  };
  const importExternalHistory = async () => {
    if (!externalHistoryFile) return toast(t("externalHistoryNoFile"));
    setBusy(true);
    startExternalImportProgress();
    try {
      const form = new FormData();
      form.append("file", externalHistoryFile);
      form.append("amountStartDate", externalAmountStartDate);
      form.append("amountEndDate", externalAmountEndDate);
      const result = await apiFormData("/api/import/external-history", "POST", form);
      const summary = result.summary || {};
      setExternalImportSummary(summary);
      clearExternalImportTimer();
      updateExternalImportProgress(92, t("externalHistoryProgressRefreshing"));
      await bootstrap();
      await loadBackups();
      updateExternalImportProgress(100, t("externalHistoryProgressDone"));
      toast(t("externalHistoryImported", { added: summary.addedRepairs || 0, skipped: summary.skippedRepairs || 0, zeroed: summary.amountZeroedRepairs || 0 }));
    } catch (error) {
      clearExternalImportTimer();
      setExternalImportProgress({ active: false, percent: 0, label: "" });
      toast(error.message || t("invalidBackupFile"));
    } finally {
      setBusy(false);
    }
  };
  const currentCounts = { clients: data.clients?.length || 0, repairs: data.repairs?.length || 0 };
  return (
    <section className="page">
      <div className="backup-grid">
        <Card>
          <CardHeader><CardTitle>{t("backup")}</CardTitle></CardHeader>
          <CardContent>
            <div className="backup-summary">
              <div>
                <b>{t("backupCounts", currentCounts)}</b>
                <span>{t("backupAutoHint")}</span>
                <span>{t("backupManualHint")}</span>
              </div>
              <div className="backup-actions">
                <Button onClick={downloadCurrent}><Download {...ICON_SM} /> {t("downloadCurrentBackup")}</Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}><Upload {...ICON_SM} /> {t("uploadBackupFile")}</Button>
                <Button variant="outline" onClick={createBackup} disabled={busy}><Database {...ICON_SM} /> {t("createBackupNow")}</Button>
                <Button variant="ghost" onClick={loadBackups} disabled={busy}><RefreshCw {...ICON_SM} /> {t("refresh")}</Button>
                <input ref={fileInputRef} className="backup-file-input" type="file" accept=".zip,.json,application/zip,application/json" onChange={importFile} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("externalHistoryImport")}</CardTitle></CardHeader>
          <CardContent>
            <div className="backup-summary">
              <div>
                <b>{externalHistoryFile?.name || t("externalHistoryFile")}</b>
                <span>{t("externalHistoryImportHint")}</span>
                {externalImportSummary ? <span>{t("externalHistoryImported", { added: externalImportSummary.addedRepairs || 0, skipped: externalImportSummary.skippedRepairs || 0, zeroed: externalImportSummary.amountZeroedRepairs || 0 })}</span> : null}
              </div>
              <div className="backup-actions">
                <ActionSurface as="label" className="ui-button ui-button-outline">
                  <Upload {...ICON_SM} /> {t("externalHistoryFile")}
                  <input hidden type="file" accept=".json,application/json" onChange={(event) => setExternalHistoryFile(event.target.files?.[0] || null)} />
                </ActionSurface>
                <Input type="date" value={externalAmountStartDate} onChange={(event) => setExternalAmountStartDate(event.target.value)} title={t("amountKeepStartDate")} />
                <Input type="date" value={externalAmountEndDate} onChange={(event) => setExternalAmountEndDate(event.target.value)} title={t("amountKeepEndDate")} />
                <Button variant="outline" onClick={importExternalHistory} disabled={busy}><Upload {...ICON_SM} /> {t("importExternalHistory")}</Button>
              </div>
            </div>
            {externalImportProgress.active ? (
              <div className="external-import-progress" role="status" aria-live="polite">
                <div className="external-import-progress-head">
                  <span>{externalImportProgress.label}</span>
                  <b>{Math.round(externalImportProgress.percent)}%</b>
                </div>
                <div className="external-import-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(externalImportProgress.percent)}>
                  <span style={{ width: `${externalImportProgress.percent}%` }} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("backupHistory")}</CardTitle></CardHeader>
          <CardContent>
            {backups.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>{t("date")}</TableHead><TableHead>{t("type")}</TableHead><TableHead>{t("data")}</TableHead><TableHead>{t("actions")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell>{formatBackupDate(backup.createdAt)}</TableCell>
                      <TableCell><Badge>{backupKindLabel(backup.kind, t)}</Badge></TableCell>
                      <TableCell>{t("backupCounts", backup.counts || {})}</TableCell>
                      <TableCell>
                        <div className="backup-row-actions">
                          <Button size="sm" variant="outline" onClick={() => restoreBackup(backup.id)} disabled={busy}><RotateCcw {...ICON_SM} /> {t("restoreBackup")}</Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadBackup(backup.id)}><Download {...ICON_SM} /> {t("downloadBackup")}</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty compact>{t("backupEmpty")}</Empty>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("advancedJsonImport")}</CardTitle></CardHeader>
          <CardContent>
            <Toolbar><Button variant="outline" onClick={exportData}>{t("exportJson")}</Button><Button variant="outline" onClick={importData}>{t("importJson")}</Button><Button variant="outline" onClick={importLocal}>{t("importLocalStorage")}</Button></Toolbar>
            <Textarea className="backup-textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("backupPlaceholder")} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Metric({ title, value, className }) {
  return <Card className={className}><CardContent><div className="metric-title">{title}</div><div className="metric-value">{value}</div></CardContent></Card>;
}

function ReportTable({ title, rows, amount, t, variant = "list" }) {
  if (variant === "rank-grid") {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
          {rows.length ? (
            <div className="report-rank-grid">
              {rows.map((row, index) => (
                <div className="report-rank-item" key={row.name}>
                  <span className="report-rank-number">{index + 1}</span>
                  <span className="report-rank-name" title={row.name}>{row.name}</span>
                  <b className="report-rank-count">{row.count}{amount ? ` / ${money(row.amount)}` : ""}</b>
                </div>
              ))}
            </div>
          ) : <Empty>{t("noData")}</Empty>}
        </CardContent>
      </Card>
    );
  }
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length ? rows.map((row) => <div className="report-row" key={row.name}><span>{row.name}</span><b>{row.count}{amount ? ` / ${money(row.amount)}` : ""}</b></div>) : <Empty>{t("noData")}</Empty>}</CardContent></Card>;
}

function RevenueTrendChart({ rows = [], metric = "both", t }) {
  const showAmount = metric === "both" || metric === "amount";
  const showOrders = metric === "both" || metric === "orders";
  const chartRows = rows.slice(-18);
  const maxAmount = Math.max(...chartRows.map((row) => row.amount), 1);
  const maxCount = Math.max(...chartRows.map((row) => row.count), 1);
  const barHeight = (value, max) => {
    const numeric = Number(value || 0);
    if (!numeric) return "0%";
    return `${Math.max(6, Math.min(100, (numeric / max) * 100))}%`;
  };
  const shortValue = (value, options = {}) => {
    const numeric = Number(value || 0);
    const suffix = options.suffix || "";
    const absolute = Math.abs(numeric);
    if (absolute >= 1000000) return `${(numeric / 1000000).toFixed(1).replace(/\.0$/, "")}M${suffix}`;
    if (absolute >= 1000) return `${(numeric / 1000).toFixed(1).replace(/\.0$/, "")}k${suffix}`;
    if (options.integer) return String(Math.round(numeric));
    return `${numeric.toFixed(absolute >= 10 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  };
  return (
    <div className="revenue-trend-chart" role="group" aria-label={t("revenueTrend")}>
      {chartRows.length ? (
        <>
          <div className="revenue-trend-legend">
            {showAmount ? <span className="amount">{t("trendMetricAmount")}</span> : null}
            {showOrders ? <span className="orders">{t("trendMetricOrders")}</span> : null}
          </div>
          <div className="revenue-trend-plot" role="list">
            {chartRows.map((row) => (
              <article className="revenue-trend-item" key={row.key} role="listitem" aria-label={`${row.label}，${t("trendMetricAmount")} ${money(row.amount)}，${t("trendMetricOrders")} ${row.count}`}>
                <div className="revenue-trend-bars">
                  {showAmount ? (
                    <div className="revenue-trend-bar-wrap amount" title={`${row.label} ${t("trendMetricAmount")}: ${money(row.amount)}`}>
                      <span className="revenue-trend-value" aria-hidden="true">{shortValue(row.amount, { suffix: " €" })}</span>
                      <i className="revenue-trend-bar" style={{ "--trend-value": barHeight(row.amount, maxAmount) }} aria-hidden="true" />
                    </div>
                  ) : null}
                  {showOrders ? (
                    <div className="revenue-trend-bar-wrap orders" title={`${row.label} ${t("trendMetricOrders")}: ${row.count}`}>
                      <span className="revenue-trend-value" aria-hidden="true">{shortValue(row.count, { integer: true })}</span>
                      <i className="revenue-trend-bar" style={{ "--trend-value": barHeight(row.count, maxCount) }} aria-hidden="true" />
                    </div>
                  ) : null}
                </div>
                <span className="revenue-trend-label" title={row.label}>{row.label}</span>
              </article>
            ))}
          </div>
        </>
      ) : <Empty compact>{t("noData")}</Empty>}
    </div>
  );
}

function splitPropertyTokens(value) {
  return String(value || "")
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinPropertyTokens(tokens) {
  return tokens
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index)
    .join("，");
}

function attributeCatalogLabel(item = {}, lang = "zh") {
  const es = String(item.es || "").trim();
  const zh = String(item.zh || "").trim();
  const def = String(item.defaultName || "").trim();
  if (lang === "es") return es || def || zh;
  return zh || def || es;
}

function AttributeSelectionPanel({ value, onChange, items = [], lang = "zh", t }) {
  const [query, setQuery] = useState("");
  const selected = splitPropertyTokens(value);
  const selectedKeys = new Set(selected.map((item) => item.toLowerCase()));
  const catalogItems = (items || [])
    .map((item) => ({ ...item, label: attributeCatalogLabel(item, lang) }))
    .filter((item) => item.label);
  const uniqueItems = catalogItems.filter(
    (item, index, array) => array.findIndex((entry) => entry.label.toLowerCase() === item.label.toLowerCase()) === index
  );
  const labelSet = new Set(uniqueItems.map((item) => item.label.toLowerCase()));
  const legacySelected = selected
    .filter((label) => !labelSet.has(label.toLowerCase()))
    .map((label) => ({ id: `legacy-${label}`, label }));
  const mergedItems = [...legacySelected, ...uniqueItems];
  const visibleItems = mergedItems.filter((item) => !query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedCountText = lang === "es" ? `${selected.length} seleccionados` : `已选 ${selected.length} 项`;
  const clearText = lang === "es" ? "Limpiar selección" : "清空选择";
  const updateSelected = (items) => onChange(joinPropertyTokens(items));
  const toggleValue = (rawValue) => {
    const nextValue = String(rawValue || "").trim();
    if (!nextValue) return;
    const exists = selectedKeys.has(nextValue.toLowerCase());
    updateSelected(exists ? selected.filter((item) => item.toLowerCase() !== nextValue.toLowerCase()) : [...selected, nextValue]);
  };
  const addCustomValue = () => {
    const nextValue = query.trim();
    if (!nextValue || selectedKeys.has(nextValue.toLowerCase())) return;
    updateSelected([...selected, nextValue]);
    setQuery("");
  };
  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomValue();
  };

  return (
    <section className="attribute-select-panel">
      <div className="attribute-select-head">
        <span><Tag {...ICON_SM} /> {t("property")}</span>
        <div className="attribute-search-field">
          <Search {...ICON_SM} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder={lang === "es" ? "Buscar atributo" : "搜索属性"} />
        </div>
      </div>
      <div className="attribute-options-list">
        {visibleItems.length ? visibleItems.map((item) => (
          <button
            key={item.id || item.label}
            type="button"
            className={`attribute-option${selectedKeys.has(item.label.toLowerCase()) ? " active" : ""}`}
            aria-pressed={selectedKeys.has(item.label.toLowerCase())}
            onClick={() => toggleValue(item.label)}
          >
            <span className="attribute-option-label">{item.label}</span>
          </button>
        )) : <div className="attribute-options-empty">{t("noData")}</div>}
      </div>
      <div className="attribute-select-footer">
        <span>{selectedCountText}</span>
        <Button type="button" size="sm" variant="ghost" disabled={!selected.length} onClick={() => updateSelected([])}><X {...ICON_SM} /> {clearText}</Button>
      </div>
    </section>
  );
}

function RepairForm({ data, session, saveData, saveRepairRecord, deleteRepairRecord, navigate, repairDraft, setRepairDraft, catalogTab, setCatalogTab, registerUnsavedGuard, registerRepairTopbar, repairId, route = "", toast, lang, t }) {
  const detailPath = route.split("?")[0] || "";
  const isWarrantyRoute = detailPath.startsWith("/dashboard/warranties");
  const existing = repairId ? data.repairs.find((repair) => repair.id === repairId) : null;
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [paymentConfirm, setPaymentConfirm] = useState("");
  const [paymentReceived, setPaymentReceived] = useState("");
  const [finalPaymentReceived, setFinalPaymentReceived] = useState("");
  const [depositTargetAmount, setDepositTargetAmount] = useState("");
  const [pendingPaidRepair, setPendingPaidRepair] = useState(null);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState("");
  const fallbackDraft = useMemo(() => {
    const base = existing ? normalizeRepairDraftFromRecord(structuredClone(existing)) : newRepairDraft();
    if (!existing && isWarrantyRoute) return { ...base, orderType: "warranty" };
    if (existing && isWarrantyRoute && (base.orderType || "repair") !== "warranty") return { ...base, orderType: "warranty" };
    return base;
  }, [repairId, existing?.id, isWarrantyRoute]);
  useEffect(() => {
    const targetDraftId = existing?.id || "new";
    if (repairId && !existing && repairDraft?.id === repairId) return;
    if (repairDraft?.id === targetDraftId) return;
    setQrDataUrl("");
    setRepairDraft(fallbackDraft);
  }, [repairId, existing?.id, repairDraft?.id, fallbackDraft]);

  const draft = normalizeRepairDraft(repairDraft || fallbackDraft);
  const isWarrantyDraft = isWarrantyRoute || (draft.orderType || "repair") === "warranty";
  const detailBasePath = isWarrantyDraft ? "/dashboard/warranties" : "/dashboard/repairs";
  const warrantyBillingEnabled = !isWarrantyDraft || Boolean(draft.warrantyChargeable);
  const draftRef = useRef(draft);
  const initialSnapshotRef = useRef(comparableRepairDraft(fallbackDraft));
  const detailKey = existing?.id || "new";
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    initialSnapshotRef.current = comparableRepairDraft(fallbackDraft);
  }, [detailKey, fallbackDraft]);
  useEffect(() => {
    if (!registerUnsavedGuard) return undefined;
    const guard = {
      isDirty: () => Boolean(initialSnapshotRef.current && comparableRepairDraft(draftRef.current) !== initialSnapshotRef.current)
    };
    return registerUnsavedGuard(guard);
  }, [registerUnsavedGuard, detailKey]);
  useEffect(() => {
    let cancelled = false;
    const currentDraft = draftRef.current;
    if (!repairId || !existing || existing.itemsLoaded || (currentDraft?.id === repairId && currentDraft.itemsLoaded)) return undefined;
    apiGet(`/api/repairs/${repairId}`)
      .then((payload) => {
        if (cancelled || !payload?.repair) return;
        const fullDraft = normalizeRepairDraftFromRecord(payload.repair);
        initialSnapshotRef.current = comparableRepairDraft(fullDraft);
        draftRef.current = fullDraft;
        setRepairDraft(fullDraft);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repairId, existing?.id, existing?.itemsLoaded]);
  const markDraftClean = (value = draftRef.current) => {
    initialSnapshotRef.current = comparableRepairDraft(value);
  };
  const saveRepairRef = useRef(async () => {});
  const publicToken = draft?.publicToken || "";
  const publicUrl = publicToken ? buildPublicStatusUrl(data.settings, publicToken) : "";
  useEffect(() => {
    let cancelled = false;
    if (!publicUrl) {
      setQrDataUrl("");
      return undefined;
    }
    QRCode.toDataURL(publicUrl, { width: 180, margin: 1 })
      .then((value) => {
        if (!cancelled) setQrDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  const subtotal = repairAmount(draft);
  const total = chargeAmount(draft);
  const paidTotal = repairPaidAmount(draft);
  const due = Math.max(0, total - paidTotal);
  const hasBillableTotal = total >= 0.01;
  const paymentRowsForDraft = repairPaymentsForDisplay(draft, t);
  const isFirstPayment = paymentRowsForDraft.length === 0;
  const depositCollected = repairDepositAmount(draft);
  const depositPaymentAmount = roundMoney(draft.deposit);
  const remainingDeposit = roundMoney(depositPaymentAmount - depositCollected);
  const dueAfterDeposit = Math.max(0, total - depositPaymentAmount);
  const depositExceedsTotal = depositPaymentAmount - total > 0.005;
  const hasDeposit = depositCollected >= 0.01;
  const hasPaymentActivity = paidTotal >= 0.01 || hasDeposit;
  const repairFieldsComplete = !repairRequiredFieldsMissing(draft, data.clients);
  const canUsePaymentActions = repairFieldsComplete && (!isWarrantyDraft || warrantyBillingEnabled || hasPaymentActivity);
  const isPaidInFull = hasBillableTotal && due < 0.01;
  const isWarrantyDone = isWarrantyDraft && ["完成", "已取走"].includes(normalizeStatus(draft.status));
  const isPickedUp = isWarrantyDraft ? isWarrantyDone : isPickedUpRepairStatus(draft.status);
  const canRecordPayment = canUsePaymentActions && hasBillableTotal && due >= 0.01;
  const canManageDeposit = canUsePaymentActions && hasBillableTotal && (hasDeposit || due >= 0.01 || (hasPaymentActivity && isPaidInFull));
  const usePaidAdjustment = hasPaymentActivity && !hasDeposit;
  const depositButtonLabel = hasDeposit ? t("depositManageButton") : (usePaidAdjustment ? t("paymentManageButton") : (draft.id === "new" ? t("recordDepositAndCreate") : t("recordDepositPayment")));
  const depositButtonHelper = hasDeposit
    ? t("depositAdjustHelper")
    : usePaidAdjustment
      ? (due >= 0.01 ? t("paymentAdjustHelperPartial") : t("paymentAdjustHelper"))
      : t("depositPaidHelper");
  const paymentBillingBlockedReason = isWarrantyDraft && !warrantyBillingEnabled && !hasPaymentActivity ? t("warrantyPaymentChargeRequired") : t("paymentNoPendingAmount");
  const depositDisabledReason = !repairFieldsComplete ? t("requiredRepairFields") : !canUsePaymentActions ? paymentBillingBlockedReason : !hasBillableTotal ? paymentBillingBlockedReason : !canManageDeposit ? t("paymentNoPendingAmount") : "";
  const paymentDisabledReason = !repairFieldsComplete ? t("requiredRepairFields") : !canUsePaymentActions ? paymentBillingBlockedReason : !hasBillableTotal || due < 0.01 ? t("paymentNoPendingAmount") : "";
  const paymentActionHelper = isFirstPayment ? t("paymentButtonHelper") : t("paymentFollowupHelper");
  const paidCloseHelper = isPaidInFull ? (isPickedUp ? t("paymentReceivedHelper") : (isWarrantyDraft ? t("warrantyMarkDoneHelper") : t("fullPaidNoWarrantyHelper"))) : paymentActionHelper;
  const depositTargetValid = isMoneyInputValid(depositTargetAmount);
  const depositTargetValue = depositTargetValid ? roundMoney(depositTargetAmount) : 0;
  const depositAdjustmentDiff = roundMoney(depositTargetValue - depositCollected);
  const paidAdjustmentDiff = roundMoney(depositTargetValue - paidTotal);
  const paymentReceivedAmount = roundMoney(paymentReceived);
  const paymentRecordAmount = Math.min(due, paymentReceivedAmount);
  const paymentChange = Math.max(0, roundMoney(paymentReceivedAmount - due));
  const paymentAmountMissing = paymentConfirm === "payment" && paymentReceivedAmount < 0.01;
  const paymentWillComplete = !isFirstPayment && paymentRecordAmount >= 0.01 && paidTotal + paymentRecordAmount + 0.005 >= total;
  const canRecordDepositPayment = total >= 0.01 && depositPaymentAmount >= 0.01 && remainingDeposit >= 0.01 && !depositExceedsTotal && repairFieldsComplete;
  const canRecordFinalPayment = due >= 0.01 && repairFieldsComplete;
  const canStartPaidWarranty = due < 0.01 && repairFieldsComplete && !isPickedUpRepairStatus(draft.status);
  const depositPaymentDisabledReason = !repairFieldsComplete ? t("requiredRepairFields") : total < 0.01 ? t("paymentNoPendingAmount") : depositPaymentAmount < 0.01 ? t("depositPaymentRequired") : depositExceedsTotal ? t("depositPaymentExceedsTotal") : remainingDeposit < 0.01 ? t("paymentNoPendingAmount") : "";
  const depositButtonUsesDialog = usePaidAdjustment;
  const depositButtonDisabled = hasDeposit || depositButtonUsesDialog ? !canManageDeposit : !canRecordDepositPayment;
  const depositButtonTitle = hasDeposit || depositButtonUsesDialog ? depositDisabledReason : depositPaymentDisabledReason;
  const finalPaymentDisabledReason = !repairFieldsComplete ? t("requiredRepairFields") : due < 0.01 ? t("paymentNoPendingAmount") : "";
  const finalPaymentReceivedAmount = roundMoney(finalPaymentReceived);
  const finalPaymentChange = Math.max(0, roundMoney(finalPaymentReceivedAmount - due));
  const finalPaymentReceivedInsufficient = paymentConfirm === "final" && finalPaymentReceivedAmount + 0.005 < due;
  const finalPaymentActionSettled = isPaidInFull && isPickedUp;
  const finalPaymentActionLabel = canStartPaidWarranty ? t("paidWarrantyButton") : (finalPaymentActionSettled ? t("paymentReceivedButton") : t("finalPaymentButton"));
  const finalPaymentActionHelper = canStartPaidWarranty ? t("paidWarrantyHelper") : (finalPaymentActionSettled ? t("paymentReceivedHelper") : t("paidCloseHelper"));
  const finalPaymentActionTitle = canStartPaidWarranty ? t("paidWarrantyHelper") : (finalPaymentActionSettled ? t("paymentReceivedHelper") : finalPaymentDisabledReason);
  const costTotal = repairCostAmount(draft);
  const profit = total - costTotal;
  const discountPercentValue = subtotal > 0 ? roundMoney((parseMoneyInput(draft.discountAmount) / subtotal) * 100) : 0;
  const selectedClient = clientById(data, draft.clientId);
  const clientPhone = String(selectedClient.phone || draft.phone || "").trim();
  const clientEmail = String(selectedClient.email || draft.email || "").trim();
  const whatsappMessage = buildWhatsappProgressMessage(data.settings, draft, selectedClient, publicUrl);
  const whatsappUrl = buildWhatsappUrl(clientPhone, whatsappMessage);
  const receiptWhatsappMessage = buildReceiptWhatsappMessage(data.settings, draft, selectedClient, { total, paidTotal, due, publicUrl });
  const receiptWhatsappUrl = buildWhatsappUrl(clientPhone, receiptWhatsappMessage);
  const progressEmailUrl = buildProgressEmailUrl(clientEmail, draft, whatsappMessage);
  const selectedTechnician = (data.technicians || []).find((item) => item.id === draft.technicianId);
  const clientPhoneSearchValue = draft.phone || draft.clientSearch || selectedClient.phone || "";
  const clientNameSearchValue = draft.clientName || selectedClient.name || "";
  const activeClientSearchValue = clientDropdownOpen === "name" ? clientNameSearchValue : clientPhoneSearchValue;
  const normalizedClientSearch = activeClientSearchValue.trim().toLowerCase();
  const clientRepairCounts = useMemo(() => {
    return data.repairs.reduce((counts, repair) => {
      if (repair.clientId) counts[repair.clientId] = (counts[repair.clientId] || 0) + 1;
      return counts;
    }, {});
  }, [data.repairs]);
  const clientMatches = (normalizedClientSearch
    ? data.clients.filter((client) => [client.phone, client.name, client.identity, client.email].join(" ").toLowerCase().includes(normalizedClientSearch))
    : data.clients
  ).slice(0, 8);
  const selectedClientRepairs = selectedClient.id
    ? data.repairs
      .filter((repair) => repair.clientId === selectedClient.id && repair.id !== draft.id)
      .sort((a, b) => String(b.repairTime || b.ticket || "").localeCompare(String(a.repairTime || a.ticket || "")))
    : [];
  const filteredModels = sortCatalogRows(data.models).filter((model) => {
    const brand = data.brands.find((item) => item.id === model.brandId);
    return !draft.brand || brand?.name.toLowerCase() === draft.brand.toLowerCase();
  });
  const buildUpdatedDraft = (previousDraft, key, value) => {
    const previous = previousDraft || draft;
    const next = { ...previous, [key]: value };
    if (key === "clientSearch") {
      const client = data.clients.find((item) => item.name.toLowerCase() === value.toLowerCase());
      if (client) return { ...next, clientId: client.id, clientName: client.name, clientLevel: normalizeClientLevel(client.level), docType: client.docType || "DNI", identity: client.identity, email: client.email, phone: client.phone, address: client.address };
      return { ...next, clientId: "", clientName: value };
    }
    if (key === "clientName") {
      next.clientId = "";
      next.clientName = formatClientName(value);
      return next;
    }
    if (key === "orderType") {
      const nextType = value === "warranty" ? "warranty" : "repair";
      next.orderType = nextType;
      next.sourceRepairId = "";
      if (nextType === "warranty") {
        next.warrantyChargeable = false;
        next.warrantyStart = "";
        if (!warrantyStatusOrder.includes(normalizeStatus(next.status))) next.status = "预定";
      } else {
        next.warrantyChargeable = false;
        if (!statusOrder.includes(normalizeStatus(next.status))) next.status = "预定";
      }
    }
    if (key === "passwordType" && value !== "Patrón") next.passwordPattern = [];
    if (key === "passwordType" && value !== "Contraseña") next.passwordText = "";
    if (key === "technicianId") {
      const technician = (data.technicians || []).find((item) => item.id === value);
      next.technicianName = technician?.name || "";
    }
    if (key === "status") {
      const nextStatus = normalizeStatus(value);
      const previousStatus = normalizeStatus(previous.status);
      next.status = nextStatus;
      if (nextStatus !== previousStatus) {
        const at = formatDateTime(new Date());
        let history = [...(previous.statusHistory || []), { status: nextStatus, at }];
        if (isOrderLockEnabled(data.settings) && isLockingFinalStatus(nextStatus)) history = appendOrderLockEvent(history, "order-locked", at);
        next.statusHistory = history;
        if ((next.orderType || "repair") !== "warranty" && isPickedUpRepairStatus(nextStatus) && (!next.warrantyStart || !isPickedUpRepairStatus(previousStatus))) {
          next.warrantyStart = at;
        }
        const email = selectedClient.email || next.email || "";
        if (email) {
          next.notificationLog = [...(previous.notificationLog || []), createNotification(email, nextStatus, next)];
        }
      }
    }
    return next;
  };
  const updateDraft = (key, value) => {
    const baseDraft = draftRef.current || draft;
    let autoSaveAfterFinalLock = false;
    if (key === "status") {
      const nextStatus = normalizeStatus(value);
      const previousStatus = normalizeStatus(baseDraft.status);
      autoSaveAfterFinalLock = isLockingFinalStatus(nextStatus) && nextStatus !== previousStatus;
      if (nextStatus === "取消" && autoSaveAfterFinalLock && !window.confirm(t("cancelLockConfirm"))) return;
    }
    const nextDraft = buildUpdatedDraft(baseDraft, key, value);
    setRepairDraft(nextDraft);
    if (autoSaveAfterFinalLock) {
      window.setTimeout(() => saveRepair(nextDraft, { stayOnPage: true }), 0);
    }
  };
  const selectClient = (client) => {
    setRepairDraft({ ...draft, clientId: client.id, clientName: formatClientName(client.name), clientLevel: normalizeClientLevel(client.level), docType: client.docType || "DNI", identity: client.identity || "", email: client.email || "", phone: client.phone || "", address: client.address || "" });
    setClientDropdownOpen("");
    if (client.level === "黑名单") toast(t("blacklistToast"));
  };
  const selectClientName = (name) => {
    setRepairDraft({ ...draft, clientId: "", clientName: formatClientName(name) });
    setClientDropdownOpen("");
  };
  const appendCatalog = (type, itemId) => {
    const collection = catalogCollectionForTab(type);
    const item = data[collection].find((entry) => entry.id === itemId);
    if (!item) return;
    const name = catalogLabel(item, lang);
    const nextItems = [...draft.items, { name, qty: 1, price: Number(item.price || 0), cost: 0, catalogType: collection, catalogId: item.id }];
    setRepairDraft({ ...draft, items: nextItems, costAmount: itemCostTotal(nextItems) });
  };
  const updateDiscountPercent = (value) => {
    const percent = Math.max(0, Math.min(100, parseMoneyInput(value)));
    updateDraft("discountAmount", roundMoney(subtotal * percent / 100));
  };
  const saveRepair = async (draftOverride = null, options = {}) => {
    const explicitDraft = draftOverride && typeof draftOverride === "object" && !("nativeEvent" in draftOverride) && !("currentTarget" in draftOverride) ? draftOverride : null;
    const workingDraft = normalizeRepairDraft(explicitDraft || draftRef.current || draft);
    const { clientId, clientToCreate } = resolveRepairClientForSave(workingDraft, data.clients);
    if (repairRequiredFieldsMissing(workingDraft, data.clients)) {
      return toast(t("requiredRepairFields"));
    }
    const payload = { ...workingDraft, clientId, publicToken: workingDraft.publicToken || publicToken };
    const isWarrantyOrder = (payload.orderType || "repair") === "warranty";
    if (isWarrantyOrder) {
      payload.orderType = "warranty";
      payload.warrantyStart = "";
      payload.warrantyChargeable = Boolean(payload.warrantyChargeable);
      payload.status = normalizeStatus(payload.status);
      if (!warrantyStatusOrder.includes(payload.status)) payload.status = "预定";
    } else if (isPickedUpRepairStatus(payload.status) && !payload.warrantyStart && !hasWarrantySkipped(payload)) {
      payload.warrantyStart = formatDateTime(new Date());
    }
    delete payload.clientSearch;
    delete payload.catalogSearch;
    if (payload.id === "new") {
      const saved = { ...payload, id: id(), ticket: String(Date.now()), statusHistory: payload.statusHistory.length ? payload.statusHistory : [{ status: payload.status, at: formatDateTime(new Date()) }] };
      const result = await saveRepairRecord(saved, clientToCreate);
      if (!result) return;
      const cleanDraft = result.repair || saved;
      markDraftClean(cleanDraft);
      setRepairDraft(cleanDraft);
      if (!options.stayOnPage) toast(t("repairCreated"));
      if (!options.deferNavigation) navigate(`${isWarrantyOrder ? "/dashboard/warranties" : "/dashboard/repairs"}/${cleanDraft.id}`, { force: true });
      return result;
    }
    const result = await saveRepairRecord(payload, clientToCreate);
    if (!result) return;
    const cleanDraft = result.repair || payload;
    markDraftClean(cleanDraft);
    setRepairDraft(cleanDraft);
    toast(t("repairSaved"));
    if (options.leaveAfterSave) navigate("/dashboard/repairs", { force: true });
    return result;
  };
  saveRepairRef.current = saveRepair;
  const customCatalogCategory = productTopCategoryFromTab(catalogTab);
  const catalogCollection = catalogCollectionForTab(catalogTab);
  const catalogTopCategories = productTopCategories(data.settings);
  const source = sortCatalogRows(data[catalogCollection] || []).filter((item) => {
    if (customCatalogCategory) return productCategoryValue(item, t) === customCatalogCategory;
    if (catalogCollection === "services") return !catalogTopCategories.includes(productCategoryValue(item, t));
    return true;
  });
  const chipItems = source.filter((item) => [item.defaultName, item.zh, item.es].join(" ").toLowerCase().includes((draft.catalogSearch || "").toLowerCase())).slice(0, 40);
  const selectedCatalogNames = new Set((draft.items || []).flatMap((item) => [item.name, localizeText(item.name, lang)]).filter(Boolean));
  const sourceRepair = isWarrantyDraft && draft.sourceRepairId ? data.repairs.find((repair) => repair.id === draft.sourceRepairId) : null;
  const linkedWarrantyOrders = existing && !isWarrantyDraft ? data.repairs.filter((repair) => repair.orderType === "warranty" && repair.sourceRepairId === existing.id) : [];
  const showWarrantyDates = shouldShowWarrantyDates(draft);
  const statusOptions = isWarrantyDraft ? warrantyStatusOrder : statusOrder;
  const orderLocked = isOrderLocked(draft, data.settings);
  const draftHasPendingSave = Boolean(initialSnapshotRef.current && comparableRepairDraft(draft) !== initialSnapshotRef.current);
  const saveDisabledByLock = orderLocked && !draftHasPendingSave;
  useEffect(() => {
    if (!registerRepairTopbar) return undefined;
    return registerRepairTopbar({
      onSave: () => saveRepairRef.current(),
      disabled: saveDisabledByLock,
      title: saveDisabledByLock ? t("orderLockedHint") : "",
      label: t("save")
    });
  }, [registerRepairTopbar, existing?.id, saveDisabledByLock, t]);
  const canUnlockOrder = orderLocked && Boolean(session?.isAdmin) && data.settings?.allowOrderUnlock !== false;
  const unlockOrder = () => {
    if (!canUnlockOrder) return;
    if (!window.confirm(t("unlockOrderConfirm"))) return;
    const at = formatDateTime(new Date());
    setRepairDraft({ ...draft, statusHistory: appendOrderLockEvent(draft.statusHistory || [], "order-unlocked", at) });
    toast(t("orderUnlocked"));
  };
  const currentWarrantyStart = draft.warrantyStart || "";
  const currentWarrantyEnd = warrantyEndDate(currentWarrantyStart, data.settings);
  const currentWarrantyPeriod = warrantyPeriodLabel(warrantyDays(data.settings), t);
  const clientRepairNotice = repairClientNotice(draft, data.settings, t);
  const showPasswordSection = shouldShowPasswordSection(data.settings, draft);
  const showPhotoSection = data.settings?.showPhotoSection !== false;
  const showSignatureSection = data.settings?.showSignatureSection !== false;
  const showQrNoticeSection = data.settings?.showQrNoticeSection !== false;
  if (repairId && !existing) {
    return <section className="page"><Empty>{t("repairNotFound")}</Empty><Button onClick={() => navigate("/dashboard/repairs", { force: true })}>{t("repairs")}</Button></section>;
  }
  const deleteRepair = async () => {
    if (!existing) return;
    if (!isWarrantyDraft && linkedWarrantyOrders.length) return toast(t("cannotDeleteRepairWithWarranty"));
    if (!confirm(isWarrantyDraft ? t("confirmDeleteWarranty") : t("confirmDeleteRepair"))) return;
    const ok = await deleteRepairRecord(existing.id);
    if (!ok) return;
    toast(isWarrantyDraft ? t("warrantyDeleted") : t("repairDeleted"));
    navigate(isWarrantyDraft ? "/dashboard/warranties" : "/dashboard/repairs", { force: true });
  };

  const cancelPaymentConfirm = () => {
    setPaymentConfirm("");
    setPaymentReceived("");
    setFinalPaymentReceived("");
    setDepositTargetAmount("");
    setPendingPaidRepair(null);
  };

  const recordDepositPayment = async () => {
    const depositAmount = roundMoney(draft.deposit);
    if (repairRequiredFieldsMissing(draft, data.clients)) return toast(t("requiredRepairFields"));
    if (total < 0.01) return toast(t("paymentNoPendingAmount"));
    if (depositAmount < 0.01) return toast(t("depositPaymentRequired"));
    if (depositAmount - total > 0.005) return toast(t("depositPaymentExceedsTotal"));
    if (remainingDeposit < 0.01) return toast(t("paymentNoPendingAmount"));
    const printWindow = openPrintWindow();
    const selectedMethod = ["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash";
    const payments = paymentsForDraftWithAdjustments({ ...draft, deposit: depositAmount }, t, selectedMethod);
    const depositDraft = { ...draft, paymentMethod: selectedMethod, payments, deposit: depositAmount };
    const shouldNavigateToCreatedRepair = depositDraft.id === "new";
    setRepairDraft(depositDraft);
    const result = await saveRepair(depositDraft, { stayOnPage: true, deferNavigation: true });
    if (!result) {
      printWindow?.close?.();
      return;
    }
    const savedRepair = result.repair || depositDraft;
    const savedClient = result.client || clientById(data, savedRepair.clientId);
    const savedSubtotal = repairAmount(savedRepair);
    const savedTotal = chargeAmount(savedRepair);
    const savedDue = Math.max(0, savedTotal - repairPaidAmount(savedRepair));
    const savedPublicUrl = savedRepair.publicToken ? buildPublicStatusUrl(data.settings, savedRepair.publicToken) : publicUrl;
    const printed = await printRepair("receipt", savedRepair, savedClient, { subtotal: savedSubtotal, total: savedTotal, due: savedDue, qrDataUrl: "", publicUrl: savedPublicUrl, settings: data.settings, printWindow });
    if (shouldNavigateToCreatedRepair && savedRepair.id) navigate(`${detailBasePath}/${savedRepair.id}`, { force: true });
    toast(printed ? t("paymentRecorded") : t("paymentRecordedPrintFailed"));
  };

  const recordPaymentAndClose = () => {
    if (repairRequiredFieldsMissing(draft, data.clients)) return toast(t("requiredRepairFields"));
    if (due < 0.01) return toast(t("paymentNoPendingAmount"));
    setFinalPaymentReceived(String(roundMoney(due).toFixed(2)));
    setPaymentConfirm("final");
  };

  const startPaidWarranty = async () => {
    if (!canStartPaidWarranty) return;
    const paidDraft = buildUpdatedDraft(draft, "status", "已取走");
    setRepairDraft(paidDraft);
    const result = await saveRepair(paidDraft, { stayOnPage: true, deferNavigation: true });
    if (result) toast(t("repairSaved"));
  };

  const executeFinalPayment = async () => {
    const receivedAmount = roundMoney(finalPaymentReceived);
    if (receivedAmount + 0.005 < due) return toast(t("finalPaymentInsufficient"));
    setPaymentConfirm("");
    setFinalPaymentReceived("");
    const printWindow = openPrintWindow();
    const existingPayments = paymentsForDraftWithAdjustments(draft, t);
    const recordedPaid = paymentTotal(existingPayments);
    const finalDue = Math.max(0, total - recordedPaid);
    const selectedMethod = ["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash";
    const nextPayments = finalDue >= 0.01
      ? [...existingPayments, { id: id(), amount: finalDue, method: selectedMethod, note: t("finalPayment"), paidAt: formatDateTime(new Date()), createdBy: "" }]
      : existingPayments;
    const paidDraft = buildUpdatedDraft({ ...draft, payments: nextPayments, deposit: repairDepositAmount({ ...draft, payments: nextPayments }) }, "status", "已取走");
    setRepairDraft(paidDraft);
    const result = await saveRepair(paidDraft, { stayOnPage: true, deferNavigation: paidDraft.id === "new" });
    if (!result) {
      printWindow?.close?.();
      return;
    }
    const savedRepair = result.repair || paidDraft;
    const savedClient = result.client || clientById(data, savedRepair.clientId);
    const savedSubtotal = repairAmount(savedRepair);
    const savedTotal = chargeAmount(savedRepair);
    const savedPublicUrl = savedRepair.publicToken ? buildPublicStatusUrl(data.settings, savedRepair.publicToken) : publicUrl;
    const printed = await printRepair("receipt", savedRepair, savedClient, { subtotal: savedSubtotal, total: savedTotal, due: 0, qrDataUrl: "", publicUrl: savedPublicUrl, settings: data.settings, printWindow });
    if (paidDraft.id === "new" && savedRepair.id) navigate(`/dashboard/repairs/${savedRepair.id}`, { force: true });
    toast(printed ? t("paymentRecorded") : t("paymentRecordedPrintFailed"));
  };

  const openDepositDialog = () => {
    if (repairRequiredFieldsMissing(draft, data.clients)) return toast(t("requiredRepairFields"));
    if (!canUsePaymentActions) return toast(paymentBillingBlockedReason);
    if (!hasBillableTotal && !hasDeposit && !hasPaymentActivity) return toast(paymentBillingBlockedReason);
    if (!hasDeposit) {
      if (hasPaymentActivity) {
        setDepositTargetAmount(String(roundMoney(paidTotal).toFixed(2)));
        setPaymentConfirm("paid-adjust");
        return;
      }
      if (due < 0.01) return toast(t("paymentNoPendingAmount"));
      setPaymentReceived("");
      setPaymentConfirm("payment");
      return;
    }
    const targetDeposit = isMoneyInputValid(draft.deposit) ? Math.max(0, roundMoney(draft.deposit)) : depositCollected;
    setDepositTargetAmount(String(targetDeposit.toFixed(2)));
    setPaymentConfirm("deposit-adjust");
  };

  const executeDepositAdjustmentTo = async (targetValue, targetValid = true) => {
    const normalizedTargetValue = Math.max(0, roundMoney(targetValue));
    const adjustmentDiff = roundMoney(normalizedTargetValue - depositCollected);
    if (!targetValid) return toast(t("depositAdjustmentInvalid"));
    if (Math.abs(adjustmentDiff) < 0.005) return toast(t("depositAdjustmentNone"));
    if (normalizedTargetValue - total > 0.005) return toast(t("depositPaymentExceedsTotal"));
    const newPaidTotal = roundMoney(paidTotal + adjustmentDiff);
    if (newPaidTotal < -0.005) return toast(t("depositAdjustmentNegativePaid"));
    if (newPaidTotal - total > 0.005) return toast(t("depositAdjustmentExceedsPaid"));
    setPaymentConfirm("");
    setDepositTargetAmount("");
    const selectedMethod = ["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash";
    const adjustmentBaseDraft = { ...draft, deposit: depositCollected };
    const existingPayments = paymentsForDraftWithAdjustments(adjustmentBaseDraft, t, selectedMethod);
    const nextPayments = [...existingPayments, {
      id: id(),
      amount: adjustmentDiff,
      method: selectedMethod,
      note: `${t("depositAdjustmentTo")} ${money(normalizedTargetValue)}`,
      paidAt: formatDateTime(new Date()),
      createdBy: ""
    }];
    const paymentDraft = { ...draft, paymentMethod: selectedMethod, payments: nextPayments, deposit: repairDepositAmount({ ...draft, payments: nextPayments }) };
    setRepairDraft(paymentDraft);
    const result = await saveRepair(paymentDraft, { stayOnPage: true, deferNavigation: true });
    if (!result) return;
    const savedRepair = result.repair || paymentDraft;
    if (paymentDraft.id === "new" && savedRepair.id) navigate(`${detailBasePath}/${savedRepair.id}`, { force: true });
    toast(t("depositAdjustmentRecorded"));
  };

  const executeDepositAdjustment = async () => {
    await executeDepositAdjustmentTo(depositTargetValue, depositTargetValid);
  };

  const executeDepositAdjustmentFromInput = async () => {
    await executeDepositAdjustmentTo(draft.deposit, isMoneyInputValid(draft.deposit));
  };

  const executePaidAdjustment = async () => {
    if (!depositTargetValid) return toast(t("depositAdjustmentInvalid"));
    if (Math.abs(paidAdjustmentDiff) < 0.005) return toast(t("depositAdjustmentNone"));
    if (depositTargetValue < -0.005) return toast(t("depositAdjustmentInvalid"));
    if (depositTargetValue - total > 0.005) return toast(t("depositAdjustmentExceedsPaid"));
    setPaymentConfirm("");
    setDepositTargetAmount("");
    const selectedMethod = ["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash";
    const existingPayments = paymentsForDraftWithAdjustments(draft, t, selectedMethod);
    const nextPayments = [...existingPayments, {
      id: id(),
      amount: paidAdjustmentDiff,
      method: selectedMethod,
      note: `${t("paidAdjustmentTo")} ${money(depositTargetValue)}`,
      paidAt: formatDateTime(new Date()),
      createdBy: ""
    }];
    const paymentDraft = { ...draft, paymentMethod: selectedMethod, payments: nextPayments, deposit: repairDepositAmount({ ...draft, payments: nextPayments }) };
    setRepairDraft(paymentDraft);
    const result = await saveRepair(paymentDraft, { stayOnPage: true, deferNavigation: true });
    if (!result) return;
    const savedRepair = result.repair || paymentDraft;
    if (paymentDraft.id === "new" && savedRepair.id) navigate(`${detailBasePath}/${savedRepair.id}`, { force: true });
    toast(t("paidAdjustmentRecorded"));
  };

  const openPaymentDialog = () => {
    if (repairRequiredFieldsMissing(draft, data.clients)) return toast(t("requiredRepairFields"));
    if (!canUsePaymentActions) return toast(paymentBillingBlockedReason);
    if (total < 0.01) return toast(t("paymentNoPendingAmount"));
    if (due < 0.01) return toast(t("paymentNoPendingAmount"));
    setPaymentReceived("");
    setPaymentConfirm("payment");
  };

  const setPaymentFullAmount = () => {
    setPaymentReceived(String(roundMoney(due).toFixed(2)));
  };

  const setAdjustmentTargetToTotal = () => {
    setDepositTargetAmount(String(roundMoney(total).toFixed(2)));
  };

  const appendAdjustmentTargetKey = (key) => {
    setDepositTargetAmount((current) => appendMoneyInputKey(current, key));
  };

  const appendPaymentKey = (key) => {
    setPaymentReceived((current) => appendMoneyInputKey(current, key));
  };

  const confirmPaymentOnEnter = (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (paymentReceivedAmount < 0.01) return;
    executePayment();
  };

  const confirmPaidAdjustmentOnEnter = (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (!depositTargetValid || Math.abs(paidAdjustmentDiff) < 0.005 || depositTargetValue - total > 0.005 || depositTargetValue < -0.005) return;
    executePaidAdjustment();
  };

  const confirmDepositAdjustmentOnEnter = (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (!depositTargetValid || Math.abs(depositAdjustmentDiff) < 0.005 || depositTargetValue - total > 0.005 || roundMoney(paidTotal + depositAdjustmentDiff) - total > 0.005 || roundMoney(paidTotal + depositAdjustmentDiff) < -0.005) return;
    executeDepositAdjustment();
  };

  const buildPaymentDraft = (baseDraft, amount, method) => {
    const existingPayments = paymentsForDraftWithAdjustments(baseDraft, t, method);
    const firstPayment = repairPaymentsForDisplay(baseDraft, t).length === 0;
    const willComplete = repairPaidAmount(baseDraft) + amount + 0.005 >= chargeAmount(baseDraft);
    const note = firstPayment ? t("depositPayment") : willComplete ? t("finalPayment") : t("paymentEntry");
    const nextPayments = [...existingPayments, { id: id(), amount, method, note, paidAt: formatDateTime(new Date()), createdBy: "" }];
    return { ...baseDraft, paymentMethod: method, payments: nextPayments, deposit: repairDepositAmount({ ...baseDraft, payments: nextPayments }) };
  };

  const executePayment = async () => {
    if (paymentReceivedAmount < 0.01) return toast(t("paymentAmountRequired"));
    if (due < 0.01) return toast(t("paymentNoPendingAmount"));
    setPaymentConfirm("");
    setPaymentReceived("");
    const selectedMethod = ["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash";
    const amountToRecord = roundMoney(Math.min(paymentReceivedAmount, due));
    const completesOrder = paidTotal + amountToRecord + 0.005 >= total;
    const shouldPrintFirstReceipt = isFirstPayment;
    const printWindow = shouldPrintFirstReceipt ? openPrintWindow() : null;
    const paymentDraft = buildPaymentDraft(draft, amountToRecord, selectedMethod);
    setRepairDraft(paymentDraft);
    const result = await saveRepair(paymentDraft, { stayOnPage: true, deferNavigation: true });
    if (!result) {
      printWindow?.close?.();
      return;
    }
    const savedRepair = result.repair || paymentDraft;
    const savedClient = result.client || clientById(data, savedRepair.clientId);
    const savedSubtotal = repairAmount(savedRepair);
    const savedTotal = chargeAmount(savedRepair);
    const savedDue = Math.max(0, savedTotal - repairPaidAmount(savedRepair));
    const savedPublicUrl = savedRepair.publicToken ? buildPublicStatusUrl(data.settings, savedRepair.publicToken) : publicUrl;
    const receiptPrintKind = (savedRepair.orderType || "repair") === "warranty" ? "warranty" : "repair";
    if (shouldPrintFirstReceipt) {
      const printed = await printRepair("receipt", savedRepair, savedClient, { subtotal: savedSubtotal, total: savedTotal, due: savedDue, qrDataUrl: "", publicUrl: savedPublicUrl, settings: data.settings, printWindow, copies: 2, printKind: receiptPrintKind });
      if (!printed) toast(t("paymentRecordedPrintFailed"));
    }
    if (paymentDraft.id === "new" && savedRepair.id) navigate(`${detailBasePath}/${savedRepair.id}`, { force: true });
    const savedDueFromDraft = Math.max(0, total - repairPaidAmount(paymentDraft));
    const savedIsWarranty = (savedRepair.orderType || "repair") === "warranty";
    const shouldPromptWarranty = !savedIsWarranty && !isFirstPayment && completesOrder && savedDueFromDraft < 0.01 && savedDue < 0.01 && !isPickedUpRepairStatus(savedRepair.status);
    if (shouldPromptWarranty) {
      setPendingPaidRepair(savedRepair);
      setPaymentConfirm("warranty");
      return;
    }
    toast(t("paymentRecorded"));
  };

  const markPaidRepairPickedUp = async ({ printKind = "repair" } = {}) => {
    const sourceDraft = normalizeRepairDraft(pendingPaidRepair || draftRef.current || draft);
    if (!sourceDraft?.id) return;
    setPaymentConfirm("");
    const printWindow = openPrintWindow();
    const sourceIsWarranty = (sourceDraft.orderType || "repair") === "warranty";
    const pickedDraft = buildUpdatedDraft(sourceDraft, "status", sourceIsWarranty ? "完成" : "已取走");
    const paidDraft = printKind === "repair"
      ? { ...pickedDraft, warrantyStart: "", statusHistory: appendWarrantySkippedEvent(pickedDraft.statusHistory) }
      : pickedDraft;
    setRepairDraft(paidDraft);
    const result = await saveRepair(paidDraft, { stayOnPage: true, deferNavigation: true });
    if (!result) {
      printWindow?.close?.();
      return;
    }
    const savedRepair = result.repair || paidDraft;
    const savedClient = result.client || clientById(data, savedRepair.clientId);
    const savedSubtotal = repairAmount(savedRepair);
    const savedTotal = chargeAmount(savedRepair);
    const savedDue = Math.max(0, savedTotal - repairPaidAmount(savedRepair));
    const savedPublicUrl = savedRepair.publicToken ? buildPublicStatusUrl(data.settings, savedRepair.publicToken) : publicUrl;
    const printed = await printRepair("receipt", savedRepair, savedClient, { subtotal: savedSubtotal, total: savedTotal, due: savedDue, qrDataUrl: "", publicUrl: savedPublicUrl, settings: data.settings, printWindow, copies: 1, printKind });
    setPendingPaidRepair(null);
    toast(printed ? t("repairSaved") : t("paymentRecordedPrintFailed"));
  };

  const skipPaidWarranty = () => {
    setPaymentConfirm("");
    setPendingPaidRepair(null);
    toast(t("paymentRecorded"));
  };

  const downloadReceiptImage = async () => {
    const ok = await createReceiptImageDownload(draft, selectedClient, {
      total,
      paidTotal,
      due,
      publicUrl,
      qrDataUrl,
      settings: data.settings
    });
    toast(ok ? t("receiptImageSaved") : t("receiptImageFailed"));
  };

  const clientNameSuggestions = [...new Set((data.clients || [])
    .map((client) => String(client.name || "").trim())
    .filter(Boolean)
    .filter((name) => !normalizedClientSearch || name.toLowerCase().includes(normalizedClientSearch))
  )].slice(0, 8);
  const renderClientDropdownMenu = (source) => clientDropdownOpen === source ? (
    <div className="client-dropdown-menu">
      {source === "name" ? (
        clientNameSuggestions.length ? clientNameSuggestions.map((name) => (
          <ActionSurface
            key={name}
            className="client-dropdown-option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectClientName(name)}
          >
            <span className="client-dropdown-main"><b>{name}</b><em>{t("clientName")}</em></span>
          </ActionSurface>
        )) : <div className="client-dropdown-empty">{t("noData")}</div>
      ) : clientMatches.length ? clientMatches.map((client) => (
        <ActionSurface
          key={client.id}
          className="client-dropdown-option"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectClient(client)}
        >
          <span className="client-dropdown-main"><b>{client.name || "-"}</b><em>{client.phone || "-"}</em></span>
          <span className="client-dropdown-meta"><ClientLevelBadge level={client.level} lang={lang} />{clientRepairCounts[client.id] ? <span>{clientRepairCounts[client.id]} {t("times")}</span> : null}</span>
        </ActionSurface>
      )) : <div className="client-dropdown-empty">{t("noData")}</div>}
    </div>
  ) : null;

  return (
    <section className={`detail-page ${isWarrantyDraft ? "detail-page-warranty" : ""} ${orderLocked ? "order-locked" : ""}`}>
      {orderLocked ? (
        <div className="order-lock-notice" role="status">
          <span className="order-lock-icon"><Lock {...ICON_SM} /></span>
          <div className="order-lock-copy">
            <div className="order-lock-title">
              <b>{t("orderLocked")}</b>
              <Badge className={`order-lock-badge ${statusClassMap[normalizeStatus(draft.status)] || ""}`}>{statusLabel(draft.status, lang)}</Badge>
            </div>
            <p>{canUnlockOrder ? t("orderLockedHint") : t("orderLockedAdminOnly")}</p>
          </div>
          {canUnlockOrder ? <Button className="order-lock-action" size="sm" variant="outline" onClick={unlockOrder}><RotateCcw {...ICON_SM} /> {t("unlockOrder")}</Button> : null}
        </div>
      ) : null}
      <fieldset className="order-lock-fieldset" disabled={orderLocked}>
      <Card className="customer-info-card">
        <CardHeader><CardTitle><ChevronDown {...ICON_SM} /> {t("customerInfo")}</CardTitle></CardHeader>
        <CardContent>
          <div className="form-grid">
            <div
              className="client-dropdown-field col-4"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setClientDropdownOpen("");
              }}
            >
              <Field as="div">
                <FieldIcon><Phone {...ICON_SM} /></FieldIcon>
                <Input
                  value={clientPhoneSearchValue}
                  onFocus={() => setClientDropdownOpen("phone")}
                  onChange={(event) => {
                    updateDraft("phone", event.target.value);
                    setClientDropdownOpen("phone");
                  }}
                  placeholder={t("inputPhoneSearch")}
                  autoComplete="off"
                />
                <IconTrigger
                  className="client-dropdown-trigger"
                  aria-label={t("inputPhoneSearch")}
                  aria-expanded={clientDropdownOpen === "phone"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setClientDropdownOpen((open) => open === "phone" ? "" : "phone")}
                >
                  <ChevronDown {...ICON_SM} />
                </IconTrigger>
              </Field>
              {renderClientDropdownMenu("phone")}
            </div>
            <div
              className="client-dropdown-field col-4"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setClientDropdownOpen("");
              }}
            >
              <Field as="div">
                <FieldIcon><User {...ICON_SM} /></FieldIcon>
                <Input
                  value={clientNameSearchValue}
                  onFocus={() => setClientDropdownOpen("name")}
                  onChange={(event) => {
                    updateDraft("clientName", formatClientName(event.target.value));
                    setClientDropdownOpen("name");
                  }}
                  placeholder={t("clientName")}
                  autoComplete="off"
                />
                <IconTrigger
                  className="client-dropdown-trigger"
                  aria-label={t("clientName")}
                  aria-expanded={clientDropdownOpen === "name"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setClientDropdownOpen((open) => open === "name" ? "" : "name")}
                >
                  <ChevronDown {...ICON_SM} />
                </IconTrigger>
              </Field>
              {renderClientDropdownMenu("name")}
            </div>
            <Field className="col-4"><Select className={`client-level-select ${clientLevelClass(normalizeClientLevel(draft.clientLevel || selectedClient.level))}`} value={normalizeClientLevel(draft.clientLevel || selectedClient.level)} onChange={(event) => updateDraft("clientLevel", event.target.value)}>{clientLevels.map((level) => <option className={clientLevelClass(level)} key={level} value={level}>{clientLevelLabel(level, lang)}</option>)}</Select></Field>
            {selectedClient.level === "黑名单" ? <div className="blacklist-alert col-12"><AlertTriangle {...ICON_SM} /> {t("blacklistAlert")}</div> : null}
            <Field className="col-2"><Select value={draft.docType || "DNI"} onChange={(event) => updateDraft("docType", event.target.value)}><option value="DNI">DNI</option><option value="NIE">NIE</option><option value="Passport">{t("docTypePassport")}</option></Select></Field>
            <Field className="col-5"><FieldIcon><IdCard {...ICON_SM} /></FieldIcon><Input value={draft.identity || selectedClient.identity || ""} onChange={(event) => updateDraft("identity", event.target.value)} placeholder={t("identity")} /></Field>
            <Field className="col-5"><FieldIcon><Mail {...ICON_SM} /></FieldIcon><Input value={draft.email || selectedClient.email || ""} onChange={(event) => updateDraft("email", event.target.value)} placeholder={t("email")} /></Field>
            {selectedClient.id ? (
              <div className="client-history-compact col-12">
                <div className="client-history-head">
                  <b>{t("repairRecords")}</b>
                  <span>{selectedClientRepairs.length ? `${selectedClientRepairs.length} ${t("times")}` : t("noRepairRecords")}</span>
                </div>
                <ActionSurface className="client-history-open" disabled={!selectedClientRepairs.length} onClick={() => navigate(`/dashboard/clients/${encodeURIComponent(selectedClient.id)}`)}>
                  <span>{selectedClientRepairs.length ? `${selectedClientRepairs.length} ${t("times")}` : t("noRepairRecords")}</span>
                  <b>{t("openOrder")}</b>
                </ActionSurface>
              </div>
            ) : null}
            <div className="client-actions-row col-12">
              <FormControlLabel className="order-type-switch">
                <span>{t("orderType")}</span>
                <Select className={`order-type-select order-type-${draft.orderType || "repair"}`} value={draft.orderType || "repair"} onChange={(event) => updateDraft("orderType", event.target.value)}>
                  <option className="order-type-option-repair" value="repair">{t("repairOrder")}</option>
                  <option className="order-type-option-warranty" value="warranty">{t("warrantyOrder")}</option>
                </Select>
              </FormControlLabel>
            </div>
          </div>
        </CardContent>
      </Card>
      <div style={{ height: 20 }} />
      <div className="repair-grid">
        <fieldset className="fieldset-card repair-info-card">
          <legend>{t("repairInfo")}</legend>
          <div className="repair-info-headline">
            <div className="repair-info-headline-left">
              <Field className="repair-status-control"><Select className={`status-select ${statusClassMap[normalizeStatus(draft.status)] || "status-reserva"}`} value={normalizeStatus(draft.status)} onChange={(event) => updateDraft("status", event.target.value)}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}</Select></Field>
              <TechnicianPicker
                className="repair-technician-control"
                value={draft.technicianId}
                legacyName={draft.technicianName}
                selectedTechnician={selectedTechnician}
                technicians={sortCatalogRows(data.technicians || [])}
                onChange={(value) => updateDraft("technicianId", value)}
                t={t}
              />
            </div>
            {clientRepairNotice ? <span className={`status-side-notice ${clientRepairNotice.type}`}>{clientRepairNotice.text}</span> : null}
          </div>
          <div className="form-grid">
            <div className="repair-device-layout col-12">
              <div className="repair-device-fields">
                <div className="device-labeled-control">
                  <span>{t("brand")} <b>*</b></span>
                  <ComboField icon={<Tag {...ICON_SM} />} value={draft.brand} onChange={(value) => updateDraft("brand", value)} options={sortCatalogRows(data.brands).map((brand) => brand.name)} placeholder={t("brand")} />
                </div>
                <div className="device-labeled-control">
                  <span>{t("model")} <b>*</b></span>
                  <ComboField value={draft.model} onChange={(value) => updateDraft("model", value)} options={filteredModels.map((model) => model.name)} placeholder={t("model")} />
                </div>
              </div>
              <AttributeSelectionPanel
                value={draft.properties}
                onChange={(value) => updateDraft("properties", value)}
                items={sortCatalogRows(data.attributes || [])}
                lang={lang}
                t={t}
              />
            </div>
            {isWarrantyDraft ? (
              <>
                <Field className="col-4"><FieldIcon><ShieldCheck {...ICON_SM} /></FieldIcon><Input readOnly value={sourceRepair?.ticket || draft.sourceRepairId || ""} placeholder={t("sourceRepairTicket")} /></Field>
                <CheckboxLine className="col-8"><Checkbox checked={Boolean(draft.warrantyChargeable)} onChange={(event) => updateDraft("warrantyChargeable", event.target.checked)} /> {t("warrantyChargeable")}</CheckboxLine>
                <Field className="col-12"><FieldIcon><MessageCircle {...ICON_SM} /></FieldIcon><Textarea value={draft.warrantyReason || ""} onChange={(event) => updateDraft("warrantyReason", event.target.value)} placeholder={t("warrantyIssue")} /></Field>
                <Field className="col-6"><FieldIcon><Search {...ICON_SM} /></FieldIcon><Textarea value={draft.warrantyDiagnosis || ""} onChange={(event) => updateDraft("warrantyDiagnosis", event.target.value)} placeholder={t("warrantyDiagnosis")} /></Field>
                <Field className="col-6"><FieldIcon><Wrench {...ICON_SM} /></FieldIcon><Textarea value={draft.warrantyResolution || ""} onChange={(event) => updateDraft("warrantyResolution", event.target.value)} placeholder={t("warrantyResolution")} /></Field>
              </>
            ) : null}
          </div>
          <Tabs>
            <TabsTrigger active={catalogTab === "services"} onClick={() => setCatalogTab("services")}><CircleAlert {...ICON_SM} /> {t("productService")}</TabsTrigger>
            <TabsTrigger active={catalogTab === "parts"} onClick={() => setCatalogTab("parts")}><Package {...ICON_SM} /> {t("productPart")}</TabsTrigger>
            {catalogTopCategories.map((category) => (
              <TabsTrigger key={category} active={catalogTab === productTopCategoryTab(category)} onClick={() => setCatalogTab(productTopCategoryTab(category))}><Folder {...ICON_SM} /> {category}</TabsTrigger>
            ))}
            <div className="search"><Input value={draft.catalogSearch || ""} onChange={(event) => updateDraft("catalogSearch", event.target.value)} placeholder={t("search")} /></div>
          </Tabs>
          <ChipGroup>
            {chipItems.map((item) => {
              const label = catalogLabel(item, lang);
              const active = selectedCatalogNames.has(label);
              return <Chip key={item.id} active={active} onClick={() => appendCatalog(catalogTab, item.id)}>{label}</Chip>;
            })}
          </ChipGroup>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <Field className="col-12"><FieldIcon><Pencil {...ICON_SM} /></FieldIcon><Textarea value={draft.issue} onChange={(event) => updateDraft("issue", event.target.value)} placeholder={t("repairNote")} /></Field>
            <Field className="col-12"><FieldIcon><StickyNote {...ICON_SM} /></FieldIcon><Textarea value={draft.internalNote} onChange={(event) => updateDraft("internalNote", event.target.value)} placeholder={t("internalNote")} /></Field>
            <Field className={showWarrantyDates ? "col-3" : "col-6"}><FieldIcon><Wrench {...ICON_SM} /></FieldIcon><Input type="datetime-local" value={toDateTimeInput(draft.repairTime)} onChange={(event) => updateDraft("repairTime", fromDateTimeInput(event.target.value))} /></Field>
            {showWarrantyDates ? (
              <>
                <Field className="col-3"><FieldIcon><CheckCircle2 {...ICON_SM} /></FieldIcon><Input type="datetime-local" value={toDateTimeInput(currentWarrantyStart)} onChange={(event) => updateDraft("warrantyStart", fromDateTimeInput(event.target.value))} placeholder={t("warrantyStart")} /></Field>
                <Field className="col-3"><FieldIcon><CalendarClock {...ICON_SM} /></FieldIcon><Input readOnly value={currentWarrantyEnd} placeholder={t("warrantyEnd")} /></Field>
                <Field className="col-3"><FieldIcon><ShieldCheck {...ICON_SM} /></FieldIcon><Input readOnly value={currentWarrantyPeriod} placeholder={t("warrantyPeriod")} /></Field>
              </>
            ) : null}
          </div>
          {showPhotoSection || showSignatureSection ? <div className="media-grid">
            {showPhotoSection ? <PhotoInput label={t("frontPhoto")} value={draft.frontPhoto} onChange={(value) => updateDraft("frontPhoto", value)} t={t} /> : null}
            {showPhotoSection ? <PhotoInput label={t("backPhoto")} value={draft.backPhoto} onChange={(value) => updateDraft("backPhoto", value)} t={t} /> : null}
            {showSignatureSection ? <div className="signature-panel">
              <div>
                <b>{t("customerSignature")}</b>
                <span>{draft.signedAt || t("unsigned")}</span>
              </div>
              {draft.signatureDataUrl ? <img src={draft.signatureDataUrl} alt={t("customerSignature")} /> : null}
              <Button size="sm" variant="outline" onClick={() => setSignatureOpen(true)}>{t("signature")}</Button>
            </div> : null}
          </div> : null}
          {showPasswordSection ? <div className="password-panel">
            <div className="password-panel-head">
              <span><KeyRound {...ICON_SM} /> {t("passwordType")}</span>
              <Field className="password-type-field"><Select className="password-select" value={draft.passwordType} onChange={(event) => updateDraft("passwordType", event.target.value)}><option value="">{t("unset")}</option><option value="Patrón">{t("patternPassword")}</option><option value="Contraseña">{t("textPassword")}</option></Select></Field>
            </div>
            {draft.passwordType === "Contraseña" ? <Field className="password-text-field"><FieldIcon><Lock {...ICON_SM} /></FieldIcon><Input value={draft.passwordText || ""} onChange={(event) => updateDraft("passwordText", event.target.value)} placeholder={t("textPassword")} /></Field> : null}
            {draft.passwordType === "Patrón" ? <PatternLock draft={draft} setRepairDraft={setRepairDraft} t={t} /> : null}
          </div> : null}
        </fieldset>
        <fieldset className="fieldset-card price-info-card">
          <legend>{t("price")}</legend>
          <div className="price-products-panel">
            <div className="price-tools-row">
              <Button type="button" size="sm" variant="outline" onClick={() => setCostDialogOpen(true)}><Pencil {...ICON_SM} /> {t("quickEditCosts")}</Button>
            </div>
            <PriceEditor draft={draft} setRepairDraft={setRepairDraft} t={t} />
            <TableContainer className="price-items-wrap">
              <RepairItemsTable draft={draft} setRepairDraft={setRepairDraft} t={t} lang={lang} />
            </TableContainer>
          </div>
          <div className="price-payment-layout">
            <section className="payment-card deposit-card">
              <label className="deposit-entry">
                <span>{t("deposit")}</span>
                <div className="currency-input">
                  <span>€</span>
                  <Input {...MONEY_INPUT_PROPS} value={draft.deposit} onChange={(event) => updateDraft("deposit", event.target.value)} onBlur={() => { if (String(draft.deposit ?? "").trim() === "") updateDraft("deposit", 0); }} />
                </div>
              </label>
              <div className="pending-after-deposit">
                <WalletCards {...ICON} />
                <span>{t("dueAfterDeposit")}</span>
                <b>{money(dueAfterDeposit)}</b>
              </div>
              <PaymentMethodPicker value={["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash"} onChange={(value) => updateDraft("paymentMethod", value)} t={t} />
              <button type="button" className={`deposit-payment-button ${due < 0.01 ? "paid-in-full" : ""}`} disabled={depositButtonDisabled} title={depositButtonTitle} onClick={hasDeposit ? executeDepositAdjustmentFromInput : (depositButtonUsesDialog ? openDepositDialog : recordDepositPayment)}>
                <span>{depositButtonLabel}</span>
              </button>
              <small className="paid-close-helper">{depositButtonHelper}</small>
              <PaymentHistory payments={draft.payments} t={t} lang={lang} />
            </section>
            <section className="payment-card totals-card">
              <div className="totals-rows totals-muted-rows">
                <div className="totals-line totals-muted"><span>{t("costAmount").replace(" €", "")}</span><b>{money(costTotal)}</b></div>
                <div className="totals-line totals-muted"><span>{t("profitAmount")}</span><b className={profit < 0 ? "negative" : ""}>{money(profit)}</b></div>
              </div>
              <label className="discount-percent-field">
                <span>{t("discountPercent")}</span>
                <Input {...MONEY_INPUT_PROPS} value={Number.isFinite(discountPercentValue) ? discountPercentValue : 0} onChange={(event) => updateDiscountPercent(event.target.value)} />
              </label>
              <div className="totals-divider" />
              <div className="totals-line totals-main"><span>{t("total")}</span><b>{money(total)}</b></div>
              <div className="totals-line totals-deposit"><span>{t("paidAmount")}</span><b>- {money(paidTotal)}</b></div>
              <div className="totals-line totals-due"><span>{t("due")}</span><b>{money(due)}</b></div>
              <button type="button" className={`paid-close-button ${canStartPaidWarranty ? "paid-warranty-button" : ""}`} disabled={!canRecordFinalPayment && !canStartPaidWarranty} title={finalPaymentActionTitle} onClick={canStartPaidWarranty ? startPaidWarranty : recordPaymentAndClose}>
                <span>{finalPaymentActionLabel}</span>
              </button>
              <small className="paid-close-helper">{finalPaymentActionHelper}</small>
              <div className="receipt-send-actions">
                <ActionSurface
                  as="a"
                  className={`receipt-whatsapp-button ${clientPhone ? "" : "is-disabled"}`}
                  href={clientPhone ? receiptWhatsappUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!clientPhone}
                  title={clientPhone ? (due > 0 ? t("sendCurrentReceiptWhatsapp") : t("sendReceiptWhatsapp")) : t("receiptWhatsappDisabled")}
                  onClick={(event) => {
                    if (!clientPhone) event.preventDefault();
                  }}
                >
                  <MessageCircle size={16} strokeWidth={1.75} />
                  <span>{due > 0 ? t("sendCurrentReceiptWhatsapp") : t("sendReceiptWhatsapp")}</span>
                </ActionSurface>
                <ActionSurface className="receipt-whatsapp-button" onClick={downloadReceiptImage}>
                  <Download size={16} strokeWidth={1.75} />
                  <span>{t("receiptImage")}</span>
                </ActionSurface>
              </div>
            </section>
          </div>
          {showQrNoticeSection ? <div className="qr-panel">
            {qrDataUrl ? <img src={qrDataUrl} alt={t("progressQr")} /> : null}
            <div className="qr-panel-content">
              <b>{t("qrTitle")}</b>
              <TextLink className="qr-link" href={publicUrl} target="_blank" rel="noopener noreferrer">
                <span>{publicUrl}</span>
                <ExternalLink {...ICON_SM} />
              </TextLink>
              <div className="qr-actions">
                <ButtonLink
                  variant="outline"
                  size="sm"
                  className="ui-button-icon"
                  disabled={!clientPhone}
                  href={clientPhone ? whatsappUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("sendWhatsapp")}
                  onClick={(event) => {
                    if (!clientPhone) event.preventDefault();
                  }}
                >
                  <MessageCircle size={20} strokeWidth={1.75} />
                </ButtonLink>
                <ButtonLink
                  variant="outline"
                  size="sm"
                  className="ui-button-icon"
                  disabled={!clientEmail}
                  href={clientEmail ? progressEmailUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("email")}
                  onClick={(event) => {
                    if (!clientEmail) event.preventDefault();
                  }}
                >
                  <Mail size={20} strokeWidth={1.75} />
                </ButtonLink>
              </div>
            </div>
          </div> : null}
          {showQrNoticeSection ? <NotificationLog draft={draft} setRepairDraft={setRepairDraft} lang={lang} t={t} /> : null}
        </fieldset>
      </div>
      </fieldset>
      {signatureOpen && !orderLocked && showSignatureSection ? <SignatureDialog draft={draft} setRepairDraft={setRepairDraft} close={() => setSignatureOpen(false)} t={t} /> : null}
      <Dialog open={paymentConfirm === "final"} onOpenChange={(open) => { if (!open) cancelPaymentConfirm(); }} title={t("confirmTitle")} contentClassName="confirm-dialog-content">
        <DialogBody className="confirm-dialog final-payment-dialog">
          <p className="confirm-dialog-message">{t("paidConfirm")}</p>
          <FormControlLabel className="final-payment-received-field">
            <span>{t("finalPaymentReceiveAmount")}</span>
            <Input
              {...MONEY_INPUT_PROPS}
              value={finalPaymentReceived}
              onChange={(event) => setFinalPaymentReceived(event.target.value)}
            />
          </FormControlLabel>
          <div className="final-payment-summary">
            <div><span>{t("finalPaymentDueAmount")}</span><b>{money(due)}</b></div>
            <div><span>{t("finalPaymentReceiveAmount").replace(" €", "")}</span><b>{money(finalPaymentReceivedAmount)}</b></div>
            <div className={finalPaymentChange > 0 ? "positive" : ""}><span>{t("finalPaymentChangeAmount")}</span><b>{money(finalPaymentChange)}</b></div>
          </div>
          {finalPaymentReceivedInsufficient ? <div className="final-payment-error">{t("finalPaymentInsufficient")}</div> : null}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={cancelPaymentConfirm}>{t("cancel")}</Button>
            <Button type="button" disabled={finalPaymentReceivedInsufficient} onClick={executeFinalPayment}>{t("confirmAction")}</Button>
          </DialogFooter>
        </DialogBody>
      </Dialog>
      <Dialog open={paymentConfirm === "paid-adjust"} onOpenChange={(open) => { if (!open) cancelPaymentConfirm(); }} title={t("paymentAdjustTitle")} contentClassName="confirm-dialog-content payment-dialog-content">
        <DialogBody className="confirm-dialog final-payment-dialog payment-calculator-dialog">
          <p className="confirm-dialog-message">{t("paymentAdjustHelper")}</p>
          <PaymentMethodPicker value={["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash"} onChange={(value) => updateDraft("paymentMethod", value)} t={t} />
          <FormControlLabel className="final-payment-received-field">
            <span>{t("paymentTargetAmount")}</span>
            <Input
              {...MONEY_INPUT_PROPS}
              value={depositTargetAmount}
              onChange={(event) => setDepositTargetAmount(event.target.value)}
              onKeyDown={confirmPaidAdjustmentOnEnter}
            />
          </FormControlLabel>
          <div className="final-payment-summary">
            <div><span>{t("paymentCurrentAmount")}</span><b>{money(paidTotal)}</b></div>
            <div><span>{t("depositAdjustmentAmount")}</span><b className={paidAdjustmentDiff < 0 ? "negative" : paidAdjustmentDiff > 0 ? "positive" : ""}>{money(paidAdjustmentDiff)}</b></div>
            <div><span>{t("total")}</span><b>{money(total)}</b></div>
            <div><span>{t("due")}</span><b>{money(Math.max(0, total - roundMoney(paidTotal + paidAdjustmentDiff)))}</b></div>
          </div>
          {!depositTargetValid ? <div className="final-payment-error">{t("depositAdjustmentInvalid")}</div> : null}
          {depositTargetValid && depositTargetValue - total > 0.005 ? <div className="final-payment-error">{t("depositAdjustmentExceedsPaid")}</div> : null}
          {depositTargetValid && depositTargetValue < -0.005 ? <div className="final-payment-error">{t("depositAdjustmentNegativePaid")}</div> : null}
          <PaymentKeypad appendKey={appendAdjustmentTargetKey} fillFullAmount={setAdjustmentTargetToTotal} t={t} />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={cancelPaymentConfirm}>{t("cancel")}</Button>
            <Button
              type="button"
              disabled={!depositTargetValid || Math.abs(paidAdjustmentDiff) < 0.005 || depositTargetValue - total > 0.005 || depositTargetValue < -0.005}
              onClick={executePaidAdjustment}
            >
              {t("confirmAction")}
            </Button>
          </DialogFooter>
        </DialogBody>
      </Dialog>
      <Dialog open={paymentConfirm === "deposit-adjust"} onOpenChange={(open) => { if (!open) cancelPaymentConfirm(); }} title={t("depositAdjustTitle")} contentClassName="confirm-dialog-content payment-dialog-content">
        <DialogBody className="confirm-dialog final-payment-dialog payment-calculator-dialog">
          <p className="confirm-dialog-message">{t("depositAdjustHelper")}</p>
          <PaymentMethodPicker value={["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash"} onChange={(value) => updateDraft("paymentMethod", value)} t={t} />
          <FormControlLabel className="final-payment-received-field">
            <span>{t("depositTargetAmount")}</span>
            <Input
              {...MONEY_INPUT_PROPS}
              value={depositTargetAmount}
              onChange={(event) => setDepositTargetAmount(event.target.value)}
              onKeyDown={confirmDepositAdjustmentOnEnter}
            />
          </FormControlLabel>
          <div className="final-payment-summary">
            <div><span>{t("depositCurrentAmount")}</span><b>{money(depositCollected)}</b></div>
            <div><span>{t("depositAdjustmentAmount")}</span><b className={depositAdjustmentDiff < 0 ? "negative" : depositAdjustmentDiff > 0 ? "positive" : ""}>{money(depositAdjustmentDiff)}</b></div>
            <div><span>{t("paidAmount")}</span><b>{money(paidTotal)}</b></div>
            <div><span>{t("due")}</span><b>{money(due)}</b></div>
          </div>
          {!depositTargetValid ? <div className="final-payment-error">{t("depositAdjustmentInvalid")}</div> : null}
          {depositTargetValid && depositTargetValue - total > 0.005 ? <div className="final-payment-error">{t("depositPaymentExceedsTotal")}</div> : null}
          {depositTargetValid && roundMoney(paidTotal + depositAdjustmentDiff) - total > 0.005 ? <div className="final-payment-error">{t("depositAdjustmentExceedsPaid")}</div> : null}
          {depositTargetValid && roundMoney(paidTotal + depositAdjustmentDiff) < -0.005 ? <div className="final-payment-error">{t("depositAdjustmentNegativePaid")}</div> : null}
          <PaymentKeypad appendKey={appendAdjustmentTargetKey} fillFullAmount={setAdjustmentTargetToTotal} t={t} />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={cancelPaymentConfirm}>{t("cancel")}</Button>
            <Button
              type="button"
              disabled={!depositTargetValid || Math.abs(depositAdjustmentDiff) < 0.005 || depositTargetValue - total > 0.005 || roundMoney(paidTotal + depositAdjustmentDiff) - total > 0.005 || roundMoney(paidTotal + depositAdjustmentDiff) < -0.005}
              onClick={executeDepositAdjustment}
            >
              {t("confirmAction")}
            </Button>
          </DialogFooter>
        </DialogBody>
      </Dialog>
      <Dialog open={paymentConfirm === "payment"} onOpenChange={(open) => { if (!open) cancelPaymentConfirm(); }} title={t("paymentConfirmTitle")} contentClassName="confirm-dialog-content payment-dialog-content">
        <DialogBody className="confirm-dialog final-payment-dialog payment-calculator-dialog">
          <p className="confirm-dialog-message">{t("paymentCalculatorHint")}</p>
          <PaymentMethodPicker value={["cash", "card"].includes(draft.paymentMethod) ? draft.paymentMethod : "cash"} onChange={(value) => updateDraft("paymentMethod", value)} t={t} />
          <FormControlLabel className="final-payment-received-field">
            <span>{t("finalPaymentReceiveAmount")}</span>
            <Input
              {...MONEY_INPUT_PROPS}
              value={paymentReceived}
              onChange={(event) => setPaymentReceived(event.target.value)}
              onKeyDown={confirmPaymentOnEnter}
            />
          </FormControlLabel>
          <div className="final-payment-summary">
            <div><span>{t("finalPaymentDueAmount")}</span><b>{money(due)}</b></div>
            <div><span>{t("finalPaymentReceiveAmount").replace(" €", "")}</span><b>{money(paymentReceivedAmount)}</b></div>
            <div><span>{t("paymentAmount")}</span><b>{money(paymentRecordAmount)}</b></div>
            <div className={paymentChange > 0 ? "positive" : ""}><span>{t("finalPaymentChangeAmount")}</span><b>{money(paymentChange)}</b></div>
          </div>
          {paymentReceivedAmount > due + 0.005 ? <div className="final-payment-warning">{t("paymentExceedsDue")}</div> : null}
          {paymentAmountMissing ? <div className="final-payment-error">{t("paymentAmountRequired")}</div> : null}
          {paymentWillComplete ? <div className="payment-complete-note">{t("paymentWarrantyPrompt")}</div> : null}
          <PaymentKeypad appendKey={appendPaymentKey} fillFullAmount={setPaymentFullAmount} t={t} />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={cancelPaymentConfirm}>{t("cancel")}</Button>
            <Button type="button" disabled={paymentReceivedAmount < 0.01} onClick={executePayment}>{t("confirmAction")}</Button>
          </DialogFooter>
        </DialogBody>
      </Dialog>
      <Dialog open={paymentConfirm === "warranty"} onOpenChange={(open) => { if (!open) cancelPaymentConfirm(); }} title={t("confirmTitle")} contentClassName="confirm-dialog-content">
        <DialogBody className="confirm-dialog final-payment-dialog">
          <p className="confirm-dialog-message">{t("paymentWarrantyPrompt")}</p>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={skipPaidWarranty}>{t("paymentWarrantySkip")}</Button>
            <Button type="button" onClick={() => markPaidRepairPickedUp({ printKind: "warranty" })}>{t("paymentWarrantyConfirm")}</Button>
          </DialogFooter>
        </DialogBody>
      </Dialog>
      <CostQuickDialog open={costDialogOpen} onOpenChange={setCostDialogOpen} draft={draft} setRepairDraft={setRepairDraft} t={t} lang={lang} />
    </section>
  );
}

function paymentsForHistoryDisplay(payments = []) {
  let runningTotal = 0;
  let runningDeposit = 0;
  return (Array.isArray(payments) ? payments.map(normalizePaymentDraft) : [])
    .filter((payment) => Math.abs(payment.amount) >= 0.005)
    .sort((left, right) => String(left.paidAt || "").localeCompare(String(right.paidAt || "")))
    .map((payment) => {
      const depositAdjustment = isDepositAdjustment(payment);
      const paidAdjustment = isPaidAdjustment(payment);
      runningTotal = roundMoney(runningTotal + payment.amount);
      if (isDepositPayment(payment) || depositAdjustment) runningDeposit = roundMoney(runningDeposit + payment.amount);
      if (depositAdjustment) return { ...payment, displayAmount: runningDeposit };
      if (paidAdjustment) return { ...payment, displayAmount: runningTotal };
      return payment;
    });
}

function PaymentHistory({ payments = [], t, lang = "zh" }) {
  const rows = paymentsForHistoryDisplay(payments);
  return (
    <div className="payment-history">
      <div className="payment-history-title">{t("paymentHistory")}</div>
      {rows.length ? rows.map((payment) => (
        <div className="payment-history-row" key={payment.id}>
          <span>{formatPaymentDate(payment.paidAt, lang)}</span>
          <b>{money(payment.displayAmount ?? payment.amount)}</b>
          <em>{paymentDisplayNote(payment, t, lang) || t("paymentEntry")}</em>
        </div>
      )) : <Empty compact>{t("noPayments")}</Empty>}
    </div>
  );
}

function PaymentMethodPicker({ value = "cash", onChange, t }) {
  const options = [
    { value: "cash", label: t("paymentMethodCash"), icon: <Banknote {...ICON_SM} /> },
    { value: "card", label: t("paymentMethodCard"), icon: <CreditCard {...ICON_SM} /> }
  ];
  return (
    <div className="payment-method-block">
      <span>{t("paymentMethod")}</span>
      <SegmentedControl>
        {options.map((option) => (
          <SegmentedControlItem key={option.value} active={value === option.value} onClick={() => onChange(option.value)}>
            {option.icon}
            <span>{option.label}</span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}

function PaymentKeypad({ appendKey, fillFullAmount, t }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "00"];
  return (
    <div className="payment-keypad">
      <button type="button" className="payment-keypad-action" onClick={fillFullAmount}>{t("paymentFullAmount")}</button>
      <button type="button" className="payment-keypad-action" onClick={() => appendKey("clear")}>{t("paymentClear")}</button>
      <button type="button" className="payment-keypad-action" onClick={() => appendKey("backspace")}>{t("paymentBackspace")}</button>
      {keys.map((key) => (
        <button type="button" key={key} onClick={() => appendKey(key)}>{key}</button>
      ))}
    </div>
  );
}

function PriceEditor({ draft, setRepairDraft, t }) {
  const [item, setItem] = useState({ name: "", qty: 1, price: "", cost: "" });
  const addItem = () => {
    if (!item.name.trim()) return;
    const price = parseMoneyInput(item.price);
    const cost = parseMoneyInput(item.cost);
    const qty = parseMoneyInput(item.qty || 1) || 1;
    const items = [...draft.items, { name: item.name.trim(), qty, price, cost }];
    setRepairDraft({ ...draft, items, costAmount: itemCostTotal(items) });
    setItem({ name: "", qty: 1, price: "", cost: "" });
  };
  const addOnEnter = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addItem();
  };
  return (
    <div className="price-row" onKeyDown={addOnEnter}>
      <Input value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} placeholder={t("itemName")} />
      <Input type="number" value={item.qty} onChange={(event) => setItem({ ...item, qty: event.target.value })} placeholder={t("qty")} />
      <Input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" value={item.price} onChange={(event) => setItem({ ...item, price: event.target.value })} placeholder={t("unitPrice")} />
      <Input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" value={item.cost} onChange={(event) => setItem({ ...item, cost: event.target.value })} placeholder={t("itemCost")} />
      <Button size="default" variant="outline" onClick={addItem}><Plus {...ICON_SM} /></Button>
    </div>
  );
}

function RepairItemsTable({ draft, setRepairDraft, t, lang = "zh", className = "" }) {
  const updateItem = (index, patch) => {
    const items = draft.items.map((item, itemIndex) => itemIndex === index ? { ...normalizeRepairItem(item), ...patch } : normalizeRepairItem(item));
    setRepairDraft({ ...draft, items, costAmount: itemCostTotal(items) });
  };
  const removeItem = (index) => {
    const items = draft.items.filter((_, itemIndex) => itemIndex !== index).map(normalizeRepairItem);
    setRepairDraft({ ...draft, items, costAmount: itemCostTotal(items) });
  };
  return (
    <Table className={`repair-items-table ${className}`}>
      <TableHeader><TableRow><TableHead>{t("itemName")}</TableHead><TableHead>{t("qty")}</TableHead><TableHead>{t("unitPrice")}</TableHead><TableHead>{t("itemCost")}</TableHead><TableHead>{t("subtotal")}</TableHead><TableHead>{t("profitAmount")}</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{draft.items.length ? draft.items.map((item, index) => {
        const normalized = normalizeRepairItem(item);
        const qty = parseMoneyInput(normalized.qty);
        const subtotal = qty * parseMoneyInput(normalized.price);
        const profit = subtotal - qty * parseMoneyInput(normalized.cost);
        return (
          <TableRow key={item.id || `${normalized.name}-${index}`}>
            <TableCell><Textarea className="item-name-textarea" value={localizeText(normalized.name, lang)} onChange={(event) => updateItem(index, { name: event.target.value })} placeholder={t("itemName")} /></TableCell>
            <TableCell><NumberStepper value={normalized.qty} onChange={(value) => updateItem(index, { qty: value })} placeholder={t("qty")} /></TableCell>
            <TableCell><Input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" value={normalized.price} onChange={(event) => updateItem(index, { price: event.target.value })} placeholder={t("unitPrice")} /></TableCell>
            <TableCell><Input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" value={normalized.cost} onChange={(event) => updateItem(index, { cost: event.target.value })} placeholder={t("itemCost")} /></TableCell>
            <TableCell className="money-cell">{money(subtotal)}</TableCell>
            <TableCell className={`money-cell item-profit-cell ${profit < 0 ? "negative" : ""}`}>{money(profit)}</TableCell>
            <TableCell><Button className="item-remove-button" size="sm" variant="ghost" onClick={() => removeItem(index)}><X {...ICON_SM} /></Button></TableCell>
          </TableRow>
        );
      }) : <TableRow className="repair-items-empty-row"><TableCell colSpan={7}><Empty compact>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
    </Table>
  );
}

function CostQuickDialog({ open, onOpenChange, draft, setRepairDraft, t, lang = "zh" }) {
  const updateCost = (index, value) => {
    const items = (draft.items || []).map((item, itemIndex) => itemIndex === index ? { ...normalizeRepairItem(item), cost: value } : normalizeRepairItem(item));
    setRepairDraft({ ...draft, items, costAmount: itemCostTotal(items) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("quickEditCosts")}>
      <DialogBody className="cost-quick-dialog">
        <Table className="cost-quick-table">
          <TableHeader><TableRow><TableHead>{t("itemName")}</TableHead><TableHead>{t("qty")}</TableHead><TableHead>{t("unitPrice")}</TableHead><TableHead>{t("itemCost")}</TableHead></TableRow></TableHeader>
          <TableBody>{(draft.items || []).length ? (draft.items || []).map((item, index) => {
            const normalized = normalizeRepairItem(item);
            return (
              <TableRow key={item.id || `${normalized.name}-${index}`}>
                <TableCell>{localizeText(normalized.name, lang) || "-"}</TableCell>
                <TableCell className="count-cell">{normalized.qty}</TableCell>
                <TableCell className="money-cell">{money(normalized.price)}</TableCell>
                <TableCell><Input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" value={normalized.cost} onChange={(event) => updateCost(index, event.target.value)} /></TableCell>
              </TableRow>
            );
          }) : <TableRow><TableCell colSpan={4}><Empty compact>{t("noData")}</Empty></TableCell></TableRow>}</TableBody>
        </Table>
        <DialogFooter><Button type="button" onClick={() => onOpenChange(false)}>{t("confirmAction")}</Button></DialogFooter>
      </DialogBody>
    </Dialog>
  );
}

function TechnicianPicker({ value, legacyName, selectedTechnician, technicians, onChange, t, className = "", disabled = false, placeholder, portal = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const label = selectedTechnician?.name || legacyName || placeholder || t("technician");
  useEffect(() => {
    if (!open || !portal) return;
    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        right: "auto",
        top: rect.bottom + 6,
        width: Math.max(rect.width, 176),
        maxHeight: Math.max(120, window.innerHeight - rect.bottom - 18),
        zIndex: 1000
      });
    };
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, portal]);

  const menu = open ? (
    <OptionMenu className={portal ? "picker-menu-portal" : ""} style={portal ? menuStyle : undefined}>
      <OptionItem
        active={!value && !legacyName}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
      >
        {placeholder || t("technician")}
      </OptionItem>
      {legacyName && !selectedTechnician ? (
        <OptionItem className="legacy-option" active disabled onMouseDown={(event) => event.preventDefault()}>
          {legacyName}
        </OptionItem>
      ) : null}
      {technicians.map((technician) => (
        <OptionItem
          key={technician.id}
          active={technician.id === value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange(technician.id);
            setOpen(false);
          }}
        >
          <TechnicianColorDot technician={technician} /> {technician.name}
        </OptionItem>
      ))}
    </OptionMenu>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={`technician-picker ${disabled ? "is-disabled" : ""} ${className}`}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Field
        ref={triggerRef}
        as="button"
        type="button"
        className={`picker-trigger ${value || legacyName ? "has-value" : ""}`}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FieldIcon><Wrench {...ICON_SM} /></FieldIcon>
        <TechnicianColorDot technician={selectedTechnician} />
        <span className="picker-label">{label}</span>
        <ChevronDown {...ICON_SM} />
      </Field>
      {portal && menu && menuStyle && typeof document !== "undefined" ? createPortal(menu, document.body) : menu}
    </div>
  );
}

function TechnicianColorDot({ technician }) {
  if (!technician) return null;
  return <span className="technician-color-dot" style={{ backgroundColor: normalizeTechnicianColor(technician.color) }} />;
}

function PhotoInput({ label, value, onChange, t }) {
  return (
    <PhotoUpload
      label={label}
      value={value}
      onChange={onChange}
      onFile={compressImage}
      emptyLabel={t("noUpload")}
      uploadLabel={t("upload")}
      deleteLabel={t("delete")}
    />
  );
}

function SignatureDialog({ draft, setRepairDraft, close, t }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };
  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(event);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const start = (event) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = point(event);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  };
  const save = () => {
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setRepairDraft({ ...draft, signatureDataUrl: dataUrl, signedAt: formatDateTime(new Date()) });
    close();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()} title={t("customerSignature")}>
      <DialogBody>
        <canvas className="signature-canvas" width="620" height="240" ref={canvasRef} onMouseDown={start} onMouseMove={draw} onMouseUp={() => (drawingRef.current = false)} onMouseLeave={() => (drawingRef.current = false)} onTouchStart={start} onTouchMove={draw} onTouchEnd={() => (drawingRef.current = false)} />
        <DialogFooter><Button variant="outline" onClick={clear}>{t("clear")}</Button><Button onClick={save}>{t("confirmSave")}</Button></DialogFooter>
      </DialogBody>
    </Dialog>
  );
}

function NotificationLog({ draft, setRepairDraft, lang = "zh", t }) {
  const logs = draft.notificationLog || [];
  return (
    <div className="notification-panel">
      <h3>{t("notificationLog")}</h3>
      {logs.length ? logs.slice().reverse().map((log, index) => (
        <div className="notification-item" key={`${log.at}-${index}`}>
          <div><b>{statusLabel(log.status, lang)}</b><span>{log.email} · {log.at}</span></div>
          <div className="notification-actions">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(`${log.subject}\n\n${log.body}`)}>{t("copyEmail")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setRepairDraft({ ...draft, notificationLog: logs.map((item) => item === log ? { ...item, notified: true, notifiedAt: formatDateTime(new Date()) } : item) })}>{log.notified ? t("notified") : t("markNotified")}</Button>
          </div>
        </div>
      )) : <Empty compact>{t("noNotifications")}</Empty>}
    </div>
  );
}

function CostProfitBox({ costTotal, profit, t }) {
  return (
    <div className="cost-profit-box">
      <span><b>{t("costAmount")}</b><strong>{money(costTotal)}</strong></span>
      <span><b>{t("profitAmount")}</b><strong className={profit < 0 ? "negative" : ""}>{money(profit)}</strong></span>
    </div>
  );
}

function PatternLock({ draft, setRepairDraft, t = makeT("zh") }) {
  const drawingRef = useRef(false);
  const selected = Array.isArray(draft.passwordPattern) ? draft.passwordPattern : [];
  const order = Object.fromEntries(selected.map((dot, index) => [dot, index + 1]));
  const addDot = (dot, reset = false) => {
    if (!dot) return;
    setRepairDraft((current) => {
      const pattern = reset ? [] : Array.isArray(current?.passwordPattern) ? current.passwordPattern : [];
      if (pattern.includes(dot)) return current;
      return { ...current, passwordPattern: [...pattern, dot] };
    });
  };
  const dotFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const size = rect.width / 3;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / size);
    const row = Math.floor(y / size);
    if (col < 0 || col > 2 || row < 0 || row > 2) return "";
    const centerX = col * size + size / 2;
    const centerY = row * size + size / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    return distance <= Math.min(44, size * 0.42) ? String(row * 3 + col + 1) : "";
  };
  const startDraw = (event) => {
    event.preventDefault();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    addDot(dotFromPointer(event), true);
  };
  const moveDraw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    addDot(dotFromPointer(event));
  };
  const stopDraw = (event) => {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const centers = {
    1: [50, 50], 2: [150, 50], 3: [250, 50],
    4: [50, 150], 5: [150, 150], 6: [250, 150],
    7: [50, 250], 8: [150, 250], 9: [250, 250]
  };
  const segments = selected.slice(1).map((dot, index) => {
    const from = centers[selected[index]];
    const to = centers[dot];
    if (!from || !to) return null;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    const inset = 30;
    return {
      id: `${selected[index]}-${dot}-${index}`,
      x1: from[0] + (dx / length) * inset,
      y1: from[1] + (dy / length) * inset,
      x2: to[0] - (dx / length) * inset,
      y2: to[1] - (dy / length) * inset
    };
  }).filter(Boolean);
  return (
    <div className="pattern-wrap">
      <div className="pattern-head"><span style={{ fontWeight: 500, color: "hsl(var(--foreground))" }}>{t("patternPassword")}</span><span className="muted">{t("patternHint")}</span><Button size="sm" variant="outline" onClick={() => setRepairDraft((current) => ({ ...current, passwordPattern: [] }))}>{t("clear")}</Button></div>
      <div className="pattern-board" onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={stopDraw} onPointerCancel={stopDraw} onPointerLeave={stopDraw}>
        <svg className="pattern-lines" viewBox="0 0 300 300" aria-hidden="true">
          <defs><marker id="pattern-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" /></marker></defs>
          {segments.map((line) => <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} markerEnd="url(#pattern-arrow)" />)}
        </svg>
        {Array.from({ length: 9 }, (_, index) => {
          const dot = String(index + 1);
          const active = selected.includes(dot);
          return <span key={dot} className={`pattern-dot ${active ? "active" : ""}`}>{active ? order[dot] : ""}</span>;
        })}
      </div>
      <div className="pattern-value">{t("currentPattern")}: {selected.length ? selected.join(" - ") : t("unset")}</div>
    </div>
  );
}

function ModalHost({ modal, setModal, data, saveData, saveClientRecord, saveStaffRecord, saveNonRepairResource, toast, lang, t }) {
  if (!modal) return null;
  const title = modal.id ? t("edit") : t("add");
  return (
    <Dialog open={Boolean(modal)} onOpenChange={(open) => !open && setModal(null)} title={title}>
      <DialogBody>
        <ModalForm key={`${modal.type}:${modal.id || "new"}:${modal.category || ""}`} modal={modal} data={data} saveData={saveData} saveClientRecord={saveClientRecord} saveStaffRecord={saveStaffRecord} saveNonRepairResource={saveNonRepairResource} close={() => setModal(null)} toast={toast} lang={lang} t={t} />
      </DialogBody>
    </Dialog>
  );
}

function ModalForm({ modal, data, saveData, saveClientRecord, saveStaffRecord, saveNonRepairResource, close, toast, lang = "zh", t }) {
  const type = modal.type;
  const collection = type === "service" ? "services" : type === "part" ? "parts" : type === "staff" ? "users" : type === "attribute" ? "attributes" : type === "technician" ? "technicians" : `${type}s`;
  const current = modal.id ? data[collection]?.find((item) => item.id === modal.id) : {};
  const fixedCategory = normalizeProductCategory(modal.category);
  const [form, setForm] = useState(modal.id ? (current || {}) : { category: fixedCategory, ...(current || {}) });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const update = (key, value) => setForm((currentForm) => ({ ...currentForm, [key]: value }));
  const renderFooter = () => (
    <DialogFooter>
      <Button variant="outline" type="button" onClick={close} disabled={isSubmitting}>{t("cancel")}</Button>
      <Button type="submit" disabled={isSubmitting}>{modal.id ? t("save") : t("create")}</Button>
    </DialogFooter>
  );
  const toggleStaffPermission = (key, checked) => {
    setForm((currentForm) => {
      const permissions = new Set(normalizedPagePermissions(currentForm));
      if (checked) permissions.add(key);
      else permissions.delete(key);
      return { ...currentForm, pagePermissions: [...permissions] };
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (type === "staff" && saveStaffRecord) {
        const isLastAdmin = modal.id && current?.isAdmin && data.users.filter((user) => user.isAdmin).length <= 1;
        const isAdmin = isLastAdmin ? true : Boolean(form.isAdmin);
        const pagePermissions = isAdmin ? PAGE_PERMISSION_KEYS : normalizedPagePermissions(form);
        const ok = await saveStaffRecord({ id: modal.id || "", name: form.name?.trim() || "", username: form.username?.trim() || "", email: form.email || "", isAdmin, pagePermissions, password: form.password || "" });
        if (!ok) return;
        close();
        toast(modal.id ? t("saved") : t("created"));
        return;
      }

      if (type === "client" && (!(form.name || "").trim() || !(form.phone || "").trim())) {
        toast(t("phoneAndNameRequired"));
        return;
      }
      if (type === "client" && saveClientRecord) {
        const ok = await saveClientRecord({ id: modal.id || "", name: formatClientName(form.name).trim(), level: normalizeClientLevel(form.level), docType: form.docType || "DNI", identity: form.identity || "", email: form.email || "", phone: form.phone?.trim() || "", address: form.address || "", comment: form.comment || "" });
        if (!ok) return;
        close();
        toast(modal.id ? t("saved") : t("created"));
        return;
      }

      const resource = modalResource(type);
      const updater = (state) => {
        if (type === "client") {
          const name = formatClientName(form.name).trim();
          const phone = form.phone?.trim() || "";
          return upsert(state, "clients", modal.id, { id: modal.id || id(), name, level: normalizeClientLevel(form.level), docType: form.docType || "DNI", identity: form.identity || "", email: form.email || "", phone, address: form.address || "", comment: form.comment || "" });
        }
        if (type === "brand") return upsert(state, "brands", modal.id, { id: modal.id || id(), name: form.name?.trim() || "" });
        if (type === "model") return upsert(state, "models", modal.id, { id: modal.id || id(), brandId: modal.brandId, name: form.name?.trim() || "" });
        if (type === "service") return upsert(state, "services", modal.id, { id: modal.id || id(), defaultName: form.defaultName?.trim() || "", category: fixedCategory || normalizeProductCategory(form.category), zh: form.zh || "", es: form.es || "", price: parseMoneyInput(form.price) });
        if (type === "part") return upsert(state, "parts", modal.id, { id: modal.id || id(), defaultName: form.defaultName?.trim() || "", category: fixedCategory || normalizeProductCategory(form.category), zh: form.zh || "", es: form.es || "", price: parseMoneyInput(form.price) });
        if (type === "attribute") return upsert(state, "attributes", modal.id, { id: modal.id || id(), groupName: form.groupName || "其他", defaultName: form.defaultName?.trim() || "", zh: form.zh || "", es: form.es || "" });
        if (type === "staff") return state;
        if (type === "technician") return upsert(state, "technicians", modal.id, { id: modal.id || id(), name: form.name?.trim() || "", phone: form.phone || "", email: form.email || "", color: normalizeTechnicianColor(form.color), active: form.active !== false, sortOrder: form.sortOrder });
        return state;
      };
      const ok = resource && saveNonRepairResource ? await saveNonRepairResource(resource, updater) : await saveData(updater);
      if (!ok) return;
      close();
      toast(modal.id ? t("saved") : t("created"));
    } finally {
      setIsSubmitting(false);
    }
  };
  if (type === "client") {
    return (
      <form onSubmit={submit} autoComplete="off">
        <FieldGroup>
          <Field className="col-12"><FieldIcon><User {...ICON_SM} /></FieldIcon><Input name="repairnote-client-name" autoComplete="off" value={form.name || ""} onChange={(event) => update("name", event.target.value)} placeholder={t("clientName")} required /></Field>
          <Field className="col-12"><Select className={`client-level-select ${clientLevelClass(normalizeClientLevel(form.level))}`} value={normalizeClientLevel(form.level)} onChange={(event) => update("level", event.target.value)}>{clientLevels.map((level) => <option className={clientLevelClass(level)} key={level} value={level}>{clientLevelLabel(level, lang)}</option>)}</Select></Field>
          <Field className="col-3"><Select value={form.docType || "DNI"} onChange={(event) => update("docType", event.target.value)}><option value="DNI">DNI</option><option value="NIE">NIE</option><option value="Passport">{t("docTypePassport")}</option></Select></Field>
          <Field className="col-9"><FieldIcon><IdCard {...ICON_SM} /></FieldIcon><Input name="repairnote-client-identity" autoComplete="off" value={form.identity || ""} onChange={(event) => update("identity", event.target.value)} placeholder={t("identity")} /></Field>
          <Field className="col-6"><FieldIcon><Mail {...ICON_SM} /></FieldIcon><Input name="repairnote-client-email" autoComplete="off" value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder={t("email")} /></Field>
          <Field className="col-6"><FieldIcon><Phone {...ICON_SM} /></FieldIcon><Input name="repairnote-client-phone" autoComplete="off" value={form.phone || ""} onChange={(event) => update("phone", event.target.value)} placeholder={t("phone")} required /></Field>
          <Field className="col-12"><FieldIcon><MapPin {...ICON_SM} /></FieldIcon><Input name="repairnote-client-address" autoComplete="off" value={form.address || ""} onChange={(event) => update("address", event.target.value)} placeholder={t("address")} /></Field>
          <Field className="col-12"><Textarea name="repairnote-client-comment" autoComplete="off" value={form.comment || ""} onChange={(event) => update("comment", event.target.value)} placeholder={t("repairNote")} /></Field>
        </FieldGroup>
        {renderFooter()}
      </form>
    );
  }
  if (type === "brand" || type === "model") {
    return (
      <form onSubmit={submit}>
        <Field><Input value={form.name || ""} onChange={(event) => update("name", event.target.value)} placeholder={type === "brand" ? t("brand") : t("model")} required /></Field>
        {renderFooter()}
      </form>
    );
  }
  if (type === "staff") {
    const isLastAdmin = modal.id && current?.isAdmin && data.users.filter((user) => user.isAdmin).length <= 1;
    const staffPermissions = normalizedPagePermissions(form);
    return (
      <form onSubmit={submit}>
        <FieldGroup>
          <Field className="col-6"><Input value={form.name || ""} onChange={(event) => update("name", event.target.value)} placeholder={t("fullName")} required /></Field>
          <Field className="col-6"><Input value={form.username || ""} onChange={(event) => update("username", event.target.value)} placeholder={t("staffUsername")} required /></Field>
          <Field className="col-6"><Input value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder={t("email")} /></Field>
          <Field className="col-6"><Input type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} placeholder={modal.id ? t("keepPassword") : t("newPassword")} required={!modal.id} /></Field>
          <LabeledField className="col-6"><span>{t("role")}</span><Select value={form.isAdmin ? "admin" : "employee"} disabled={isLastAdmin} onChange={(event) => update("isAdmin", event.target.value === "admin")}><option value="employee">{t("employee")}</option><option value="admin">{t("admin")}</option></Select></LabeledField>
          <div className="permission-panel col-12">
            <div className="permission-panel-title">{t("pagePermissions")}</div>
            {form.isAdmin ? <div className="permission-all">{t("allPages")}</div> : (
              <div className="permission-grid">
                {PAGE_PERMISSION_KEYS.map((key) => (
                  <CheckboxLine key={key} className="permission-check"><Checkbox checked={staffPermissions.includes(key)} onChange={(event) => toggleStaffPermission(key, event.target.checked)} /> {permissionLabel(key, t)}</CheckboxLine>
                ))}
              </div>
            )}
          </div>
        </FieldGroup>
        {renderFooter()}
      </form>
    );
  }
  if (type === "technician") {
    return (
      <form onSubmit={submit}>
        <FieldGroup>
          <Field className="col-12"><FieldIcon><Wrench {...ICON_SM} /></FieldIcon><Input value={form.name || ""} onChange={(event) => update("name", event.target.value)} placeholder={t("fullName")} required /></Field>
          <Field className="col-6"><FieldIcon><Phone {...ICON_SM} /></FieldIcon><Input value={form.phone || ""} onChange={(event) => update("phone", event.target.value)} placeholder={t("phone")} /></Field>
          <Field className="col-6"><FieldIcon><Mail {...ICON_SM} /></FieldIcon><Input value={form.email || ""} onChange={(event) => update("email", event.target.value)} placeholder={t("email")} /></Field>
          <LabeledField className="col-12"><span>{t("technicianColor")}</span><div className="technician-color-options">{technicianColorOptions.map((color) => <ColorSwatchButton key={color} color={color} active={normalizeTechnicianColor(form.color) === color} onClick={() => update("color", color)} />)}</div></LabeledField>
        </FieldGroup>
        {renderFooter()}
      </form>
    );
  }
  if (type === "attribute") {
    return (
      <form onSubmit={submit}>
        <FieldGroup>
          <Field className="col-4"><Select value={form.groupName || "颜色"} onChange={(event) => update("groupName", event.target.value)}><option value="颜色">{t("groupColor")}</option><option value="其他">{t("groupOther")}</option></Select></Field>
          <Field className="col-8"><Input value={form.defaultName || ""} onChange={(event) => update("defaultName", event.target.value)} placeholder={t("defaultName")} required /></Field>
          <Field className="col-6"><Input value={form.zh || ""} onChange={(event) => update("zh", event.target.value)} placeholder={t("chinese")} /></Field>
          <Field className="col-6"><Input value={form.es || ""} onChange={(event) => update("es", event.target.value)} placeholder={t("spanish")} /></Field>
        </FieldGroup>
        {renderFooter()}
      </form>
    );
  }
  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field className="col-12"><Input value={form.defaultName || ""} onChange={(event) => update("defaultName", event.target.value)} placeholder={t("defaultName")} required /></Field>
        {(type === "service" || type === "part") && !fixedCategory ? <Field className="col-6"><Input value={form.category || ""} onChange={(event) => update("category", event.target.value)} placeholder={t("productCategory")} list={`${type}-category-list`} /><datalist id={`${type}-category-list`}>{productCategories(data[type === "service" ? "services" : "parts"], type === "service" ? data.settings?.productServiceCategories : data.settings?.productPartCategories, t).map((category) => <option key={category} value={category} />)}</datalist></Field> : null}
        <Field className="col-6"><Input value={form.zh || ""} onChange={(event) => update("zh", event.target.value)} placeholder={t("chinese")} /></Field>
        <Field className="col-6"><Input value={form.es || ""} onChange={(event) => update("es", event.target.value)} placeholder={t("spanish")} /></Field>
        {type === "service" || type === "part" ? <Field className="col-4"><Input {...MONEY_INPUT_PROPS} value={form.price || 0} onChange={(event) => update("price", event.target.value)} placeholder={t("price")} /></Field> : null}
      </FieldGroup>
      {renderFooter()}
    </form>
  );
}

function DateRangeFilter({ start, end, preset = "custom", onStartChange, onEndChange, onPreset, onClear, lang = "zh", t, showPresets = true, presetItems = null }) {
  const presets = presetItems || ["today", "yesterday", "last7Days", "last14Days", "week", "month"];
  return (
    <div className={`date-range-filter ${showPresets ? "" : "date-range-filter-compact"}`}>
      <div className="date-range-box">
        <DateInput lang={lang} value={start} onChange={onStartChange} placeholder={t("datePlaceholder")} />
        <span className="date-range-separator">→</span>
        <DateInput lang={lang} value={end} onChange={onEndChange} placeholder={t("datePlaceholder")} />
        {onClear && (start || end) ? (
          <DateClearButton onClick={onClear} aria-label={t("clear")}>
            <X size={14} strokeWidth={2} />
          </DateClearButton>
        ) : null}
      </div>
      {showPresets ? (
        <DatePresetGroup aria-label={t("quickDateRange")}>
          {presets.map((item) => (
            <DatePresetButton
              key={item}
              active={preset === item}
              onClick={() => (preset === item && onClear ? onClear() : onPreset(item))}
            >
              {t(item)}
            </DatePresetButton>
          ))}
        </DatePresetGroup>
      ) : null}
    </div>
  );
}

function DateInput({ value, onChange, placeholder, lang = "zh" }) {
  const inputRef = useRef(null);
  const displayValue = formatDateInputDisplay(value, lang) || placeholder;
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    try {
      if (typeof input.showPicker === "function") input.showPicker();
    } catch {
      input.click();
    }
  };
  return (
    <span className={`localized-date-input ${value ? "has-value" : ""}`} onClick={openPicker}>
      <span className="localized-date-value">{displayValue}</span>
      <Input ref={inputRef} type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} aria-label={placeholder} />
    </span>
  );
}

function formatDateInputDisplay(value, lang = "zh") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return lang === "es" ? `${day}/${month}/${year}` : `${year}/${month}/${day}`;
}

function clientLevelLabel(level, lang = "zh") {
  const value = normalizeClientLevel(level);
  if (lang !== "es") return value;
  const labels = { VIP: "VIP", "超级 VIP": "VIP Plus", "黑名单": "Lista negra" };
  return labels[value] || DEFAULT_CLIENT_LEVEL;
}

function clientLevelClass(level) {
  return `level-${normalizeClientLevel(level).replaceAll(" ", "-")}`;
}

function normalizeClientLevel(level) {
  return clientLevels.includes(level) ? level : DEFAULT_CLIENT_LEVEL;
}

function attributeGroupLabel(groupName, t) {
  if (groupName === "颜色") return t("groupColor");
  if (groupName === "其他") return t("groupOther");
  return groupName || t("groupOther");
}

function normalizeProductCategory(category, fallback = "") {
  return String(category || fallback || "").trim();
}

function productCategoryValue(item, t) {
  return normalizeProductCategory(item?.category, t("defaultProductCategory"));
}

function productTopCategories(settings = {}) {
  return [...new Set((Array.isArray(settings?.productCatalogCategories) ? settings.productCatalogCategories : [])
    .map((name) => normalizeProductCategory(name))
    .filter(Boolean))];
}

function productTopCategoryTab(category) {
  return `category:${category}`;
}

function productTopCategoryFromTab(tab) {
  if (typeof tab !== "string" || !tab.startsWith("category:")) return "";
  return normalizeProductCategory(tab.slice("category:".length));
}

function catalogCollectionForTab(tab) {
  return tab === "parts" ? "parts" : "services";
}

function productCategories(items = [], configured = [], t = makeT("zh")) {
  const names = new Set();
  (Array.isArray(configured) ? configured : []).forEach((category) => {
    const name = normalizeProductCategory(category);
    if (name) names.add(name);
  });
  items.forEach((item) => names.add(productCategoryValue(item, t)));
  return [...names];
}

function scannedTicketValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const direct = value.match(/\bW?\d{8,}\b/i);
  if (direct) return direct[0];
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : value;
}

function findRepairByTicket(repairs = [], rawValue = "") {
  const candidates = scanCandidates(rawValue);
  if (!candidates.length) return null;
  return repairs.find((repair) => {
    const values = [repair.ticket, repair.publicToken, repair.id].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    return candidates.some((candidate) => values.includes(candidate));
  }) || null;
}

function scanCandidates(rawValue) {
  const value = String(rawValue || "").trim();
  const candidates = new Set();
  const add = (item) => {
    const next = String(item || "").trim().toLowerCase();
    if (next) candidates.add(next);
  };
  add(value);
  add(scannedTicketValue(value));
  try {
    const url = new URL(value);
    url.pathname.split("/").filter(Boolean).forEach(add);
    url.hash.split(/[/?#=&\s]+/).filter(Boolean).forEach(add);
    add(url.searchParams.get("ticket"));
    add(url.searchParams.get("id"));
    add(url.searchParams.get("token"));
  } catch {
    value.split(/[/?#=&\s]+/).forEach(add);
  }
  return [...candidates];
}

function scanShortcutLabel(value) {
  return String(value || "F2").replace("CtrlOrMeta", "Ctrl / ⌘");
}

function isScanSearchShortcut(event, settings = {}) {
  const shortcut = String(settings?.scanShortcut || "F2");
  if (shortcut === "CtrlOrMeta+K") {
    return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && String(event.key || "").toLowerCase() === "k";
  }
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === shortcut;
}

function ClientLevelBadge({ level, lang = "zh" }) {
  const value = normalizeClientLevel(level);
  return <span className={`client-level ${clientLevelClass(value)}`}>{clientLevelLabel(value, lang)}</span>;
}

function OrderTypeBadge({ repair, t }) {
  const isWarranty = repair.orderType === "warranty";
  return <span className={`order-type-badge ${isWarranty ? "warranty" : "repair"} ${statusClassMap[normalizeStatus(repair.status)] || "status-reserva"}`}>{isWarranty ? t("warrantyOrder") : t("repairs")}</span>;
}

function MobileBossSummary({ t, total, repairCount, warrantyCount, repairingCount, amount, profit, lang }) {
  return (
    <section className="mobile-boss-summary" data-smoke="mobile-boss-summary">
      <div className="mobile-boss-primary">
        <MobileStatTile label={t("orderCount")} value={total} strong />
        <MobileStatTile label={t("filteredRepairOrders")} value={repairCount} />
        <MobileStatTile label={t("filteredWarrantyOrders")} value={warrantyCount} />
        <MobileStatTile label={statusLabel("维修中", lang)} value={repairingCount} />
      </div>
      <div className="mobile-boss-secondary">
        <span>{t("total")}: <b>{money(amount)}</b></span>
        <span>{t("profitAmount")}: <b className={profit < 0 ? "negative" : ""}>{money(profit)}</b></span>
      </div>
    </section>
  );
}

function MobileStatTile({ label, value, strong = false }) {
  return (
    <div className={`mobile-stat-tile ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function MobileRepairCard({
  repair,
  client = EMPTY_CLIENT,
  amount = 0,
  cost = 0,
  profit = 0,
  technician = null,
  technicianOptions = [],
  legacyTechnicianName = "",
  route,
  navigate,
  lang,
  t,
  settings = {},
  onStatusChange,
  onTechnicianChange,
  onItemsClick,
  readonly = false
}) {
  const [open, setOpen] = useState(false);
  const isWarranty = repair.orderType === "warranty";
  const locked = isOrderLocked(repair, settings);
  const technicianLabel = repairTechnicianLabel(repair, new Map(technicianOptions.map((item) => [item.id, item])), technicianNameLookup(technicianOptions), t);
  const contentLabel = repairContentLabel(repair, lang);
  const targetRoute = route || (isWarranty ? `/dashboard/warranties/${repair.id}` : `/dashboard/repairs/${repair.id}`);
  const openDetail = () => navigate(targetRoute);
  const stop = (event) => event.stopPropagation();
  return (
    <article
      className={`mobile-order-card ${isWarranty ? "warranty" : "repair"} ${technician ? "technician-marked-card" : ""}`}
      style={technician ? { "--technician-color": normalizeTechnicianColor(technician.color) } : undefined}
      onClick={openDetail}
      data-smoke="mobile-order-card"
    >
      <div className="mobile-order-head">
        <div className="mobile-order-ticket">
          <b>{repair.ticket || "-"}</b>
          <OrderTypeBadge repair={repair} t={t} />
        </div>
        <StatusPill status={normalizeStatus(repair.status)} lang={lang} />
      </div>
      <div className="mobile-order-main">
        <div>
          <b>{client.name || repair.clientName || "-"}</b>
          <span>{client.phone || repair.phone || "-"}</span>
        </div>
        <div>
          <b>{[repair.brand, repair.model].filter(Boolean).join(" / ") || "-"}</b>
          <span className="mobile-order-time">{formatDateTimeDisplay(repair.repairTime, lang) || "-"}</span>
        </div>
      </div>
      <div className="mobile-order-meta">
        <span>{t("assignedTechnician")}: <b>{technicianLabel}</b></span>
        <span>{t("total")}: <b>{money(amount)}</b></span>
        <span>{t("profitAmount")}: <b className={profit < 0 ? "negative" : ""}>{money(profit)}</b></span>
      </div>
      <p className="mobile-order-issue" title={contentLabel}>{contentLabel || "-"}</p>
      <div className="mobile-order-actions" onClick={stop}>
        <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setOpen((current) => !current); }}>
          <SlidersHorizontal {...ICON_SM} /> {t("operation")}
        </Button>
      </div>
      {open ? (
        <div className="mobile-order-action-panel" onClick={stop}>
          {readonly ? (
            <Button size="sm" variant="outline" onClick={openDetail}>{t("openOrder")}</Button>
          ) : (
            <>
              <Select className={`status-select ${statusClassMap[normalizeStatus(repair.status)] || "status-reserva"}`} value={normalizeStatus(repair.status)} disabled={locked} onChange={(event) => onStatusChange?.(repair.id, event.target.value)}>
                {(isWarranty ? warrantyStatusOrder : statusOrder).map((status) => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}
              </Select>
              <TechnicianPicker
                className="repair-technician-inline mobile-technician-picker"
                value={repair.technicianId || ""}
                legacyName={legacyTechnicianName}
                selectedTechnician={technician}
                technicians={technicianOptions}
                disabled={locked}
                placeholder={t("unassignedTechnician")}
                portal
                onChange={(value) => onTechnicianChange?.(repair.id, value)}
                t={t}
              />
              <Button size="sm" variant="outline" onClick={(event) => onItemsClick?.(event, repair)}><Menu {...ICON_SM} /> {t("operation")}</Button>
              <Button size="sm" variant="outline" onClick={openDetail}>{t("openOrder")}</Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function MobileTechnicianRankCard({ row, rank, technician, onClick, t }) {
  return (
    <button type="button" className={`mobile-technician-rank-card ${row.isUnassigned ? "technician-row-unassigned" : ""}`} onClick={onClick} data-smoke="mobile-technician-rank-card">
      <span className="mobile-rank-number">{rank}</span>
      <div className="mobile-rank-main">
        <div className="technician-name-cell"><TechnicianColorDot technician={technician} /><b>{row.isUnassigned ? t("unassignedTechnician") : row.name || t("technician")}</b></div>
        <div className="mobile-rank-counts">
          <span>{t("orderCount")} <b>{row.orderCount}</b></span>
          <span>{t("technicianRepairOrders")} <b>{row.repairCount}</b></span>
          <span>{t("technicianWarrantyOrders")} <b>{row.warrantyCount}</b></span>
        </div>
      </div>
      <div className="mobile-rank-money">
        <span>{money(row.amount)}</span>
        <b className={row.profit < 0 ? "negative" : ""}>{money(row.profit)}</b>
      </div>
    </button>
  );
}

function MobileTechnicianDashboardCard({ row, navigate, lang, t, onMoveUp, onMoveDown, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const latestLabel = row.latestRepair
    ? `${row.latestRepair.brand || ""} ${row.latestRepair.model || ""}`.trim() || row.latestRepair.ticket || "-"
    : "-";
  const stop = (event) => event.stopPropagation();
  return (
    <article className={`mobile-technician-card ${row.isUnassigned ? "technician-row-unassigned" : ""}`} onClick={() => navigate(`/dashboard/technicians/${encodeURIComponent(row.id)}`)} data-smoke="mobile-technician-card">
      <div className="mobile-technician-card-head">
        <div className="technician-name-cell"><TechnicianColorDot technician={row.technician} /><b>{row.name}</b></div>
        <span>{row.recordCount} {t("times")}</span>
      </div>
      <div className="mobile-technician-card-meta">
        <span>{t("technicianOpenOrders")} <b>{row.openCount}</b></span>
        <span>{t("technicianRepairOrders")} <b>{row.repairCount}</b></span>
        <span>{t("technicianWarrantyOrders")} <b>{row.warrantyCount}</b></span>
      </div>
      <div className="mobile-technician-latest">
        <span>{t("latestRepair")}</span>
        <b>{latestLabel}{row.latestRepair ? ` · ${statusLabel(row.latestRepair.status, lang)}` : ""}</b>
      </div>
      <div className="mobile-technician-money">
        <span>{t("technicianRepairRevenue")} <b>{money(row.repairAmount)}</b></span>
        <span>{t("technicianRepairProfit")} <b className={row.repairProfit < 0 ? "negative" : ""}>{money(row.repairProfit)}</b></span>
        <span>{t("technicianWarrantyLoss")} <b className={row.warrantyLoss > 0 ? "negative" : ""}>{money(row.warrantyLoss)}</b></span>
      </div>
      <div className="mobile-technician-actions" onClick={stop}>
        <Button size="sm" variant="outline" onClick={() => setOpen((current) => !current)}><SlidersHorizontal {...ICON_SM} /> {t("operation")}</Button>
        {open ? (
          <div className="mobile-technician-action-panel">
            {onMoveUp ? <Button size="sm" variant="outline" onClick={onMoveUp}><ChevronUp {...ICON_SM} /></Button> : null}
            {onMoveDown ? <Button size="sm" variant="outline" onClick={onMoveDown}><ChevronDown {...ICON_SM} /></Button> : null}
            {onEdit ? <Button size="sm" variant="outline" onClick={onEdit}><Pencil {...ICON_SM} /> {t("edit")}</Button> : null}
            {onDelete ? <Button size="sm" variant="danger" onClick={onDelete}><Trash2 {...ICON_SM} /> {row.technician ? t("delete") : t("deleteHistoricalRecords")}</Button> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Pagination({ page, pageKey, filters, setFilters, t = makeT("zh") }) {
  const totalPages = Math.max(1, Number(page.totalPages || 1));
  const currentPage = Math.min(Math.max(1, Number(page.current || 1)), totalPages);
  const setPage = (next) => {
    const nextPage = Math.min(Math.max(1, Number(next || 1)), totalPages);
    setFilters({ ...filters, [pageKey]: nextPage });
  };
  const visibleCount = Math.min(totalPages, 5);
  const startPage = Math.min(Math.max(1, currentPage - Math.floor(visibleCount / 2)), Math.max(1, totalPages - visibleCount + 1));
  const pages = Array.from({ length: visibleCount }, (_, index) => startPage + index);
  return (
    <div className="pagination">
      <Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft {...ICON_SM} /></Button>
      {pages.map((num) => <Button key={num} size="sm" variant={currentPage === num ? "default" : "ghost"} onClick={() => setPage(num)}>{num}</Button>)}
      <Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight {...ICON_SM} /></Button>
      <span style={{ marginLeft: 8 }}>{t("jumpTo")}</span>
      <Input style={{ width: 52, height: 28 }} value={currentPage} onChange={(event) => setPage(event.target.value)} />
    </div>
  );
}

function TablePagination({ page, pageKey, filters, setFilters, t = makeT("zh") }) {
  const total = Number(page.total || 0);
  if (!total) return null;
  return (
    <div className="table-pagination">
      <span>{t("paginationSummary", { page: page.current, pages: page.totalPages, total })}</span>
      <Pagination page={page} pageKey={pageKey} filters={filters} setFilters={setFilters} t={t} />
    </div>
  );
}

function pageTitle(route, t = makeT("zh")) {
  const path = route.split("?")[0];
  if (route === "/dashboard/quick-print") return t("quickFindPrint");
  if (path.startsWith("/dashboard/clients")) return t("clients");
  if (route === "/dashboard/categories") return t("brandModel");
  if (route === "/dashboard/products") return t("productCatalog");
  if (route === "/dashboard/modules") return t("parts");
  if (route === "/dashboard/services") return t("services");
  if (route === "/dashboard/attributes") return t("attributes");
  if (route === "/dashboard/staff") return t("staff");
  if (path.startsWith("/dashboard/technicians")) return t("technicians");
  if (path.startsWith("/dashboard/warranties/")) return `${t("warrantyOrder")} ${t("edit")}`;
  if (path === "/dashboard/warranties") return t("warrantyOrders");
  if (route === "/dashboard/reports") return t("reports");
  if (route === "/dashboard/finance") return t("finance");
  if (route === "/dashboard/settings") return t("settings");
  if (route === "/dashboard/backup") return t("backup");
  if (route.startsWith("/dashboard/repairs/new") || route.startsWith("/dashboard/repairs/")) return `${t("repairs")} ${t("edit")}`;
  return t("repairs");
}

function seedData() {
  const brands = ["Acer", "Alcatel", "Amazon", "Apple", "Archos", "Asus", "BQ", "BenQ", "BlackBerry", "Energizer", "Google", "HTC", "Haier", "Honor", "Huawei", "LG", "Lenovo", "Meizu", "Microsoft", "Motorola", "Nokia", "OnePlus", "Oppo", "Panasonic", "Samsung", "Sony", "Vertu", "Vivo", "Vodafone", "Wiko", "Xiaomi", "ZTE", "Portatil"].map((name, index) => ({ id: id(), name, sortOrder: index }));
  const brandByName = Object.fromEntries(brands.map((brand) => [brand.name, brand.id]));
  const models = [["Acer", "Allegro"], ["Apple", "IPHONE 13"], ["Apple", "IPHONE 15 PRO"], ["Samsung", "A12"], ["Samsung", "A13"], ["Samsung", "A14 5G"], ["Samsung", "S22"], ["Samsung", "S23 ULTRA"], ["Xiaomi", "REDMI NOTE 8 PRO"], ["Portatil", "PAVILION"]].filter(([brand]) => brandByName[brand]).map(([brand, name], index) => ({ id: id(), brandId: brandByName[brand], name, sortOrder: index }));
  const services = Object.entries(serviceZhMap).slice(0, 30).map(([defaultName, zh], index) => ({ id: id(), defaultName, category: ["手机壳", "水凝膜", "iPhone 钢化膜", "UV 钢化膜", "曲面水凝膜", "钢化膜"].includes(zh) ? "贴膜配件" : "维修服务", zh, es: "", price: ["手机壳", "水凝膜", "iPhone 钢化膜", "UV 钢化膜", "曲面水凝膜", "钢化膜"].includes(zh) ? 12 : 0, sortOrder: index }));
  const parts = [["Volume Button", "音量按钮", "Boton Volumen"], ["Power Button", "电源按钮", "Boton Power"], ["Battery Cover", "电池后盖", "Tapa Bateria"], ["Battery", "电池", "Bateria"], ["Glass", "玻璃", "Cristal"], ["Wireless Antenna", "无线排线", "Antena Wifi"], ["Flex", "排线", "Flex"], ["Finger Flex", "指纹排线", "Flex huella"], ["Vibrator", "振动器", "Vibrador"], ["No signal", "无信号", "No Hay Señal"]].map(([defaultName, zh, es], index) => ({ id: id(), defaultName, category: "配件", zh, es, price: 0, sortOrder: index }));
  const clients = ["VICENTE", "LUIS", "BLANCA", "JUAN JOSE RODRIGUEZ", "NESTOR", "JORGE", "IÑIGO", "VICTOR", "MANUEL LOPEZ LOPEZ", "OLGA", "FERNANDO", "CARLOS", "JESUS", "JOSE MAYOR", "JULIO", "RAFAEL PEÑAFIEL", "JAVIER"].map((name, index) => ({ id: id(), name, level: DEFAULT_CLIENT_LEVEL, docType: "DNI", identity: "", email: "", phone: `6${String(60000000 + index * 12345).slice(0, 8)}`, address: "", comment: "" }));
  const clientByName = Object.fromEntries(clients.map((client) => [client.name, client.id]));
  const repairs = [
    ["1777979211613", "OLGA", "APPLE", "IPHONE 15 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, DESCUENTO CLIENTE, No se puede testear", "Entregado", "2026-05-05 13:06", "2026-05-05 15:22"],
    ["1777978684161", "FERNANDO", "Samsung", "A14 5G", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, Protector cristal templado", "Entregado", "2026-05-05 12:57", "2026-05-05 14:03"],
    ["1777976592283", "VICENTE", "Xiaomi", "REDMI NOTE 8 PRO", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía", "Entregado", "2026-05-05 12:22", "2026-05-05 13:19"],
    ["1777974613576", "CARLOS", "Samsung", "S22", "Cambiar Batería Original Con 3 meses Garantia", "Entregado", "2026-05-05 11:49", "2026-05-05 12:32"],
    ["1777972045054", "JESUS", "APPLE", "IPHONE 13", "Conector De Carga, LE HABIA SALIDO EL MENSAJE DE DETECTADO HUMEDAD, AHORA NO CARGA", "Entregado", "2026-05-05 11:06", "2026-05-05 12:11"],
    ["1777970180682", "JOSE MAYOR", "Samsung", "A13", "BOTON POWER, FUNDA", "Entregado", "2026-05-05 10:35", "2026-05-05 11:08"],
    ["1777913104015", "JULIO", "Samsung", "T580", "REVIVIR LA BATERIA", "En espera", "2026-05-04 18:44", ""],
    ["1777911287012", "RAFAEL PEÑAFIEL", "Samsung", "S23 ULTRA", "Cambiar Pantalla Original COLOR NEGRO Con 3 meses Garantia, No se puede testear, HIDROGEL DESCUENTO", "Entregado", "2026-05-04 18:14", "2026-05-04 19:03"],
    ["1777908313805", "JAVIER", "Portatil", "PAVILION", "REPARAR BISAGRA", "En espera", "2026-05-04 17:24", ""],
    ["1777905244294", "JAVIER", "Samsung", "A12", "Cambiar Pantalla Color Negro Con 3 Meses De Garantía, No se puede testear, PROTECTOR DESCUENTO", "Entregado", "2026-05-04 16:33", "2026-05-05 11:58"]
  ].map(([ticket, clientName, brand, model, issue, status, repairTime, warrantyStart]) => ({ id: id(), ticket, clientId: clientByName[clientName] || clients[0].id, brand: brand.toUpperCase(), model, properties: "", imei: "", issue, internalNote: "", passwordType: "", passwordText: "", passwordPattern: [], status: normalizeStatus(status), repairTime, warrantyStart, technicianId: "", technicianName: "", budget: 0, deposit: 0, discountAmount: 0, costAmount: 0, frontPhoto: "", backPhoto: "", signatureDataUrl: "", signedAt: "", publicToken: id(), statusHistory: [], notificationLog: [], payments: [], items: [] }));
  return { users: [{ id: "u1", name: "ming", username: "ming", email: "", isAdmin: true, pagePermissions: PAGE_PERMISSION_KEYS }], technicians: [{ id: "staff_u1", name: "ming", phone: "", email: "", color: technicianColorOptions[0], active: true, sortOrder: 0 }], clients, brands, models, services, parts, attributes: [], settings: {}, repairs };
}

function newRepairDraft() {
  return { id: "new", ticket: "", clientId: "", clientName: "", clientLevel: DEFAULT_CLIENT_LEVEL, docType: "DNI", identity: "", email: "", phone: "", address: "", brand: "", model: "", properties: "", imei: "", issue: "", internalNote: "", passwordType: "", passwordText: "", passwordPattern: [], status: "维修中", repairTime: formatDateTime(new Date()), warrantyStart: "", technicianId: "", technicianName: "", budget: 0, deposit: 0, discountAmount: 0, costAmount: 0, frontPhoto: "", backPhoto: "", signatureDataUrl: "", signedAt: "", publicToken: id(), orderType: "repair", sourceRepairId: "", warrantyReason: "", warrantyDiagnosis: "", warrantyResolution: "", warrantyChargeable: false, paymentMethod: "none", statusHistory: [], notificationLog: [], payments: [], items: [], catalogSearch: "" };
}

function upsert(state, key, existingId, payload) {
  const nextPayload = { ...payload, sortOrder: payload.sortOrder ?? nextSortOrder(state[key] || []) };
  const items = existingId ? state[key].map((item) => item.id === existingId ? nextPayload : item) : [nextPayload, ...state[key]];
  return { ...state, [key]: items };
}

function upsertRow(rows, payload) {
  const existing = (rows || []).some((item) => item.id === payload.id);
  return existing
    ? rows.map((item) => item.id === payload.id ? { ...item, ...payload } : item)
    : [{ ...payload }, ...(rows || [])];
}

function paginate(items, pageNumber, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Number(pageNumber || 1)), totalPages);
  return { current, total: items.length, totalPages, items: items.slice((current - 1) * pageSize, current * pageSize) };
}

function nextSortOrder(rows = []) {
  return rows.reduce((max, row, index) => Math.max(max, Number(row.sortOrder ?? index)), -1) + 1;
}

function withSortOrders(rows = []) {
  return rows.map((row, index) => ({ ...row, sortOrder: Number(row.sortOrder ?? index) }));
}

function sortCatalogRows(rows = []) {
  return withSortOrders(rows).sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name || a.defaultName || "").localeCompare(String(b.name || b.defaultName || "")));
}

function normalizeTechnicianColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : technicianColorOptions[0];
}

function moveSortedRow(rows = [], idValue, direction, scopeFn = null) {
  const scopedRows = scopeFn ? rows.filter(scopeFn) : rows;
  const sorted = sortCatalogRows(scopedRows);
  const index = sorted.findIndex((row) => row.id === idValue);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return rows;
  const next = [...sorted];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  const orderById = new Map(next.map((row, rowIndex) => [row.id, rowIndex]));
  return rows.map((row) => orderById.has(row.id) ? { ...row, sortOrder: orderById.get(row.id) } : row);
}

function reorderVisibleRows(rows = [], sourceId, targetId, visibleIds = [], scopeFn = null) {
  if (!sourceId || !targetId || sourceId === targetId) return rows;
  const visibleSet = new Set(visibleIds);
  if (!visibleSet.has(sourceId) || !visibleSet.has(targetId)) return rows;
  const scopedRows = scopeFn ? rows.filter(scopeFn) : rows;
  const sorted = sortCatalogRows(scopedRows);
  const visible = sorted.filter((row) => visibleSet.has(row.id));
  const sourceIndex = visible.findIndex((row) => row.id === sourceId);
  const targetIndex = visible.findIndex((row) => row.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return rows;
  const nextVisible = [...visible];
  const [moved] = nextVisible.splice(sourceIndex, 1);
  nextVisible.splice(targetIndex, 0, moved);
  let visibleIndex = 0;
  const nextScoped = sorted.map((row) => visibleSet.has(row.id) ? nextVisible[visibleIndex++] : row);
  const orderById = new Map(nextScoped.map((row, rowIndex) => [row.id, rowIndex]));
  const updatedRows = rows.map((row) => orderById.has(row.id) ? { ...row, sortOrder: orderById.get(row.id) } : row);
  return sortCatalogRows(updatedRows);
}

function ticketSortValue(ticket) {
  const numeric = String(ticket || "").match(/\d{6,}/)?.[0];
  return numeric ? Number(numeric) : 0;
}

function compareRepairsByTicketDesc(a, b) {
  const ticketDiff = ticketSortValue(b.ticket) - ticketSortValue(a.ticket);
  if (ticketDiff) return ticketDiff;
  return String(b.repairTime || b.createdAt || "").localeCompare(String(a.repairTime || a.createdAt || ""));
}

function countStatuses(repairs) {
  return repairs.reduce((counts, repair) => {
    const status = normalizeStatus(repair.status);
    return { ...counts, [status]: (counts[status] || 0) + 1 };
  }, Object.fromEntries(statusOrder.map((status) => [status, 0])));
}

function statusLabel(status, lang = "zh") {
  const normalized = normalizeStatus(status);
  return (lang === "es" ? statusLabelsEs[normalized] : statusLabels[normalized]) || statusLabels[normalized] || normalized || status;
}

function warrantyStatusLabel(status, lang = "zh") {
  return statusLabel(status, lang);
}

function catalogLabel(item, lang = "zh") {
  if (lang === "es") return item.es || item.defaultName || item.zh || "";
  return item.zh || serviceZhMap[item.defaultName] || item.defaultName;
}

function localizeText(value, lang = "zh") {
  const source = String(value || "");
  const entries = Object.entries(lang === "es" ? serviceEsMap : serviceZhMap).sort((a, b) => b[0].length - a[0].length);
  const translated = entries.reduce((text, [from, to]) => text.replaceAll(from, to), source);
  if (lang === "es") {
    return translated
      .split("，")
      .map((part) => part.trim())
      .join(", ");
  }
  return translated
    .split(",")
    .map((part) => part.trim())
    .join("，");
}

function repairContentLabel(repair, lang = "zh") {
  if (repair.itemsLoaded === false && repair.itemsSummary) return localizeText(repair.itemsSummary, lang);
  const itemNames = (repair.items || [])
    .map((item) => {
      const name = localizeText(item.name || "", lang).trim();
      if (!name) return "";
      const qty = Number(item.qty || 0);
      return qty > 1 ? `${qty}x ${name}` : name;
    })
    .filter(Boolean);
  if (itemNames.length) return itemNames.join(lang === "es" ? ", " : "，");
  return localizeText(repair.issue || repair.warrantyReason, lang);
}

function repairPrintProblemLabel(repair, lang = "zh") {
  const properties = splitPropertyTokens(repair?.properties || "")
    .map((item) => localizeText(item, lang).trim())
    .filter(Boolean)
    .join(lang === "es" ? ", " : "，");
  return properties || repairContentLabel(repair, lang);
}

function clientById(data, clientId) {
  return data.clients.find((client) => client.id === clientId) || EMPTY_CLIENT;
}

function formatClientName(value) {
  return String(value || "")
    .toLocaleLowerCase("es-ES")
    .replace(/(^|\s)(\S)/g, (match, space, char) => `${space}${char.toLocaleUpperCase("es-ES")}`)
    .trimStart();
}

function resolveRepairClientForSave(workingDraft, clients = []) {
  const selectedClient = clients.find((client) => client.id === workingDraft.clientId) || EMPTY_CLIENT;
  let clientId = workingDraft.clientId;
  let clientToCreate = null;
  const clientName = formatClientName(workingDraft.clientName || selectedClient.name || "").trim();
  const clientPhone = (workingDraft.phone || selectedClient.phone || "").trim();
  if (!clientId && clientName && clientPhone) {
    const existingClient = clients.find((client) => client.name.toLowerCase() === clientName.toLowerCase() && client.phone === clientPhone);
    clientId = existingClient?.id || id();
    if (!existingClient) {
      clientToCreate = {
        id: clientId,
        name: clientName,
        level: normalizeClientLevel(workingDraft.clientLevel),
        docType: workingDraft.docType || "DNI",
        identity: workingDraft.identity || "",
        email: workingDraft.email || "",
        phone: clientPhone,
        address: workingDraft.address || "",
        comment: ""
      };
    }
  }
  return { clientId, clientToCreate };
}

function repairRequiredFieldsMissing(workingDraft, clients = []) {
  const { clientId } = resolveRepairClientForSave(workingDraft, clients);
  return !clientId || !workingDraft.brand || !workingDraft.model;
}

function repairHasPassword(repair = {}) {
  return Boolean(
    repair.passwordType ||
    repair.passwordText ||
    (Array.isArray(repair.passwordPattern) && repair.passwordPattern.length)
  );
}

function shouldShowPasswordSection(settings = {}, repair = {}) {
  return settings?.showPasswordSection !== false || repairHasPassword(repair);
}

function mergeRepairAndClient(data, repair, client = null, revision = data._revision) {
  const normalizedRepair = normalizeRepairDraft(repair);
  const repairs = (data.repairs || []).some((item) => item.id === normalizedRepair.id)
    ? data.repairs.map((item) => item.id === normalizedRepair.id ? normalizedRepair : item)
    : [normalizedRepair, ...(data.repairs || [])];
  const clients = client?.id
    ? ((data.clients || []).some((item) => item.id === client.id)
      ? data.clients.map((item) => item.id === client.id ? { ...item, ...client, level: normalizeClientLevel(client.level || item.level) } : item)
      : [{ ...client, level: normalizeClientLevel(client.level) }, ...(data.clients || [])])
    : (data.clients || []);
  return { ...data, clients, repairs, _revision: revision || data._revision };
}

function removeRepairFromData(data, repairId, revision = data._revision) {
  return { ...data, repairs: (data.repairs || []).filter((repair) => repair.id !== repairId), _revision: revision || data._revision };
}

function modalResource(type) {
  if (type === "technician") return "technicians";
  if (type === "brand" || type === "model" || type === "service" || type === "part") return "catalog";
  if (type === "attribute") return "attributes";
  return "";
}

function nonRepairResourcePayload(resource, data) {
  if (resource === "catalog") {
    return {
      brands: data.brands || [],
      models: data.models || [],
      services: data.services || [],
      parts: data.parts || [],
      settings: data.settings || {}
    };
  }
  if (resource === "technicians") return data.technicians || [];
  if (resource === "attributes") return data.attributes || [];
  return {};
}

function mergeNonRepairSaveResult(baseData, saved = {}) {
  const next = { ...baseData };
  ["users", "technicians", "clients", "brands", "models", "services", "parts", "attributes", "settings"].forEach((key) => {
    if (saved[key] !== undefined) next[key] = saved[key];
  });
  next._revision = revisionFromSave(baseData._revision, saved);
  if (saved._settingsUpdatedAt) next._settingsUpdatedAt = saved._settingsUpdatedAt;
  return normalizeData(next);
}

function normalizeData(data) {
  const clients = expandCompactRows(data.clientsCompact) || data.clients || [];
  const repairs = expandCompactRows(data.repairsCompact) || data.repairs || [];
  const users = (data.users || []).map((user) => ({ ...user, pagePermissions: user.isAdmin ? PAGE_PERMISSION_KEYS : normalizedPagePermissions(user) }));
  return {
    _revision: data._revision || "",
    _settingsUpdatedAt: data._settingsUpdatedAt || "",
    users,
    technicians: normalizeTechnicians(data.technicians || [], users),
    clients: clients.map((client) => ({ ...client, level: normalizeClientLevel(client.level) })),
    brands: withSortOrders(data.brands || []),
    models: withSortOrders(data.models || []),
    services: withSortOrders(data.services || []),
    parts: withSortOrders(data.parts || []),
    attributes: withSortOrders(data.attributes || []),
    settings: {
      uiLanguage: "zh",
      printLanguage: "zh",
      scanShortcut: "F2",
      defaultWarrantyDays: 90,
      defaultWarrantyMonths: 3,
      enableOrderLock: true,
      showPasswordSection: true,
      showPhotoSection: true,
      showSignatureSection: true,
      showQrNoticeSection: true,
      ...(data.settings || {})
    },
    repairs: repairs.map((repair) => normalizeRepairDraft({ ...repair, status: normalizeStatus(repair.status), items: repair.items || [] }))
  };
}

function normalizeTechnicians(technicians = [], users = []) {
  const rows = [];
  const names = new Set();
  const ids = new Set();
  const add = (item) => {
    const name = String(item?.name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const idValue = String(item?.id || `tech_${key}`).trim();
    if (names.has(key) || ids.has(idValue)) return;
    rows.push({ id: idValue, name, phone: item.phone || "", email: item.email || "", color: normalizeTechnicianColor(item.color), active: item.active !== false, sortOrder: Number(item.sortOrder ?? rows.length) });
    names.add(key);
    ids.add(idValue);
  };
  technicians.forEach(add);
  users.forEach((user) => {
    const permissions = normalizedPagePermissions(user);
    const canRepair = user.isAdmin || permissions.includes("repairs") || permissions.includes("technicians");
    if (canRepair) add({ id: `staff_${user.id}`, name: user.name || user.username, email: user.email, active: true });
  });
  return rows;
}

function expandCompactRows(compact) {
  if (!compact?.columns || !Array.isArray(compact.rows)) return null;
  return compact.rows.map((row) => Object.fromEntries(compact.columns.map((column, index) => [column, row[index]])));
}

function normalizeRepairDraft(repair) {
  const items = Array.isArray(repair.items) ? repair.items.map(normalizeRepairItem) : [];
  const payments = Array.isArray(repair.payments) ? repair.payments.map(normalizePaymentDraft) : [];
  return {
    ...repair,
    passwordType: repair.passwordType === "PIN" ? "" : repair.passwordType || "",
    passwordText: repair.passwordText || "",
    properties: repair.properties || "",
    imei: repair.imei || "",
    internalNote: repair.internalNote || "",
    technicianId: repair.technicianId || "",
    technicianName: repair.technicianName || "",
    budget: nonNegativeMoney(repair.budget),
    deposit: nonNegativeMoney(repair.deposit),
    discountAmount: nonNegativeMoney(repair.discountAmount),
    costAmount: nonNegativeMoney(repair.costAmount),
    frontPhoto: repair.frontPhoto || "",
    backPhoto: repair.backPhoto || "",
    signatureDataUrl: repair.signatureDataUrl || "",
    signedAt: repair.signedAt || "",
    publicToken: repair.publicToken || id(),
    orderType: repair.orderType || "repair",
    sourceRepairId: repair.sourceRepairId || "",
    warrantyReason: repair.warrantyReason || "",
    warrantyDiagnosis: repair.warrantyDiagnosis || "",
    warrantyResolution: repair.warrantyResolution || "",
    warrantyChargeable: Boolean(repair.warrantyChargeable),
    paymentMethod: repair.paymentMethod || "none",
    itemsTotal: nonNegativeMoney(repair.itemsTotal),
    itemsCostTotal: nonNegativeMoney(repair.itemsCostTotal),
    itemsCount: repair.itemsCount ?? items.length,
    itemsSummary: repair.itemsSummary || "",
    itemsLoaded: repair.itemsLoaded !== false,
    statusHistory: Array.isArray(repair.statusHistory) ? repair.statusHistory : [],
    notificationLog: Array.isArray(repair.notificationLog) ? repair.notificationLog : [],
    payments,
    items
  };
}

function normalizeRepairDraftFromRecord(repair) {
  const draft = normalizeRepairDraft(repair || {});
  if (!Array.isArray(draft.payments) || !draft.payments.length) return draft;
  return { ...draft, deposit: repairDepositAmount(draft) };
}

function comparableRepairDraft(draft) {
  const clean = normalizeRepairDraft(draft || {});
  delete clean.catalogSearch;
  delete clean.clientSearch;
  return stableStringify(clean);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function replaceSettingsRevision(revision, settingsUpdatedAt) {
  const value = String(revision || "");
  if (!value) return "";
  const parts = value.split("|");
  const index = parts.findIndex((part) => part.startsWith("settings:"));
  if (index === -1) return value;
  parts[index] = `settings:${settingsUpdatedAt || ""}`;
  return parts.join("|");
}

function revisionFromSave(currentRevision, saved = {}) {
  if (saved._revision) return saved._revision;
  if (saved._revisionPatch) return applyRevisionPatch(currentRevision, saved._revisionPatch);
  return currentRevision || "";
}

function applyRevisionPatch(revision, patch = {}) {
  const value = String(revision || "");
  if (!value || !patch || typeof patch !== "object") return value;
  const parts = value.split("|");
  const indexByKey = new Map(parts.map((part, index) => [part.split(":")[0], index]));
  Object.entries(patch).forEach(([key, segment]) => {
    if (!segment) return;
    const index = indexByKey.get(key);
    if (index === undefined) return;
    parts[index] = String(segment);
  });
  return parts.join("|");
}

function normalizeRepairItem(item = {}) {
  return {
    ...item,
    name: item.name || "",
    qty: normalizeMoneyDraftValue(item.qty),
    price: normalizeMoneyDraftValue(item.price),
    cost: normalizeMoneyDraftValue(item.cost)
  };
}

function normalizeMoneyDraftValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d*[.,]?\d{0,2}$/.test(trimmed)) return trimmed;
  }
  return nonNegativeMoney(value);
}

function normalizeStatus(status) {
  const map = {
    reserva: "预定",
    Reserva: "预定",
    "预定已到货": "预定到货",
    "Reserva recibida": "预定到货",
    "Reserva llegado": "预定到货",
    "待开始": "预定",
    "En espera": "预定",
    Reparando: "维修中",
    Terminado: "完成",
    Finalizado: "完成",
    Entregado: "已取走",
    Cerrado: "取消",
    Cancelar: "取消",
    "关闭": "取消",
    "待检测": "预定",
    "处理中": "维修中",
    "等客户确认": "预定到货",
    "已完成": "完成",
    "拒保": "取消"
  };
  return map[status] || status || "预定";
}

async function apiGet(url) {
  const response = await fetch(url, { headers: shopHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function apiJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...shopHeaders() },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function apiFormData(url, method, body) {
  const response = await fetch(url, { method, body, headers: shopHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function downloadFromUrl(url, filename) {
  const response = await fetch(url, { headers: shopHeaders() });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "下载失败");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadFileName(response.headers.get("content-disposition")) || filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function shopHeaders() {
  return { "x-repairnote-shop-slug": activeShopSlug || "default" };
}

function downloadFileName(contentDisposition) {
  const match = contentDisposition?.match(/filename="([^"]+)"/i) || contentDisposition?.match(/filename=([^;]+)/i);
  return match?.[1]?.trim() || "";
}

function formatBackupDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function backupKindLabel(kind, t) {
  if (kind === "auto") return t("backupKindAuto");
  if (kind === "safety") return t("backupKindSafety");
  return t("backupKindManual");
}


function normalizePaymentDraft(payment = {}) {
  return {
    ...payment,
    id: payment.id || id(),
    amount: parseMoneyInput(payment.amount),
    method: payment.method || "ledger",
    note: payment.note || "",
    paidAt: payment.paidAt || payment.createdAt || formatDateTime(new Date()),
    createdBy: payment.createdBy || ""
  };
}

function paymentTotal(payments = []) {
  return payments.reduce((sum, payment) => sum + parseMoneyInput(payment.amount), 0);
}

function roundMoney(value) {
  return Math.round(parseMoneyInput(value) * 100) / 100;
}

function nonNegativeMoney(value) {
  return Math.max(0, roundMoney(value));
}

function repairPaymentsForDisplay(repair, t = makeT("zh")) {
  const payments = Array.isArray(repair.payments) ? repair.payments.map(normalizePaymentDraft).filter((payment) => Math.abs(payment.amount) >= 0.005) : [];
  if (payments.length || !shouldUseLegacyDeposit(repair)) return payments;
  return [{ id: `legacy-${repair.id}`, amount: Number(repair.deposit || 0), method: "ledger", note: t("depositPayment"), paidAt: repair.repairTime || repair.createdAt || "" }];
}

function repairPaidAmount(repair) {
  const payments = Array.isArray(repair.payments) ? repair.payments.map(normalizePaymentDraft) : [];
  const paid = paymentTotal(payments);
  if (payments.length) return paid;
  return shouldUseLegacyDeposit(repair) ? parseMoneyInput(repair.deposit) : 0;
}

function repairDepositAmount(repair) {
  const payments = Array.isArray(repair.payments) ? repair.payments.map(normalizePaymentDraft) : [];
  if (!payments.length) return shouldUseLegacyDeposit(repair) ? parseMoneyInput(repair.deposit) : 0;
  return Math.max(0, roundMoney(paymentTotal(payments.filter((payment) => isDepositPayment(payment) || isDepositAdjustment(payment)))));
}

function shouldUseLegacyDeposit(repair) {
  return repair?.id && repair.id !== "new" && parseMoneyInput(repair.deposit) >= 0.01;
}

function formatPaymentDate(value, lang = "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(lang === "es" ? "es-ES" : "zh-CN", { hour12: false });
}

function dateInRange(value, start, end) {
  const day = String(value || "").slice(0, 10);
  if (!day) return false;
  return (!start || day >= start) && (!end || day <= end);
}

function paymentsForDraftWithAdjustments(draft, t = makeT("zh"), depositMethod = "ledger") {
  const payments = Array.isArray(draft.payments) ? draft.payments.map(normalizePaymentDraft).filter((payment) => Math.abs(payment.amount) >= 0.005) : [];
  const desiredDeposit = parseMoneyInput(draft.deposit);
  const depositPayments = payments.filter(isDepositPayment);
  const preservedPayments = payments.filter((payment) => !isDepositPayment(payment) && !isDepositAdjustment(payment) && !isManualPaymentAdjustment(payment));
  const normalizedDeposit = Math.max(0, roundMoney(desiredDeposit));
  if (normalizedDeposit < 0.01) return preservedPayments;
  const baseDeposit = depositPayments[0] || {};
  return [
    {
      id: baseDeposit.id || id(),
      amount: normalizedDeposit,
      method: baseDeposit.method || depositMethod || "ledger",
      note: t("depositPayment"),
      paidAt: baseDeposit.paidAt || formatDateTime(new Date()),
      createdBy: baseDeposit.createdBy || ""
    },
    ...preservedPayments
  ];
}

function paymentNote(payment = {}) {
  return String(payment.note || "").trim().toLowerCase();
}

function isPaidAdjustment(payment = {}) {
  const note = paymentNote(payment);
  return note.includes("收款调整") || note.includes("ajuste de cobro") || note.includes("cobro ajustado");
}

function isDepositAdjustment(payment = {}) {
  const note = paymentNote(payment);
  return note.includes("订金调整") || note.includes("ajuste de depósito") || note.includes("ajuste de deposito") || note.includes("depósito ajustado") || note.includes("deposito ajustado");
}

function adjustmentTargetText(note = "", label = "") {
  const target = String(note).match(/(?:至|a|->)\s*(-?\d+(?:[.,]\d{1,2})?\s*€?)/i)?.[1]?.trim();
  return target ? `${label} ${target}` : label;
}

function paymentDisplayNote(payment = {}, t = makeT("zh"), lang = "zh") {
  const note = String(payment.note || "").trim();
  if (!note) return "";
  const normalized = note.toLowerCase();
  if (isPaidAdjustment(payment)) return adjustmentTargetText(note, t("paidAdjustmentTo"));
  if (isDepositAdjustment(payment)) return adjustmentTargetText(note, t("depositAdjustmentTo"));
  if (normalized.includes("订金") || normalized.includes("历史订金") || normalized.includes("depósito") || normalized.includes("deposito")) return t("depositPayment");
  if (normalized.includes("尾款") || normalized.includes("pago final")) return t("finalPayment");
  if (normalized.includes("手动收款调整")) return lang === "es" ? "Ajuste manual de cobro" : "手动收款调整";
  if (normalized.includes("手动退款调整")) return lang === "es" ? "Ajuste manual de devolución" : "手动退款调整";
  return note;
}

function isDepositPayment(payment = {}) {
  const note = paymentNote(payment);
  return !isDepositAdjustment(payment) && (note.includes("订金") || note.includes("历史订金") || note.includes("depósito") || note.includes("deposito"));
}

function isManualPaymentAdjustment(payment = {}) {
  const note = paymentNote(payment);
  return note.includes("手动收款调整") || note.includes("手动退款调整");
}

function repairAmount(repair) {
  if (repair.itemsLoaded === false && Number(repair.itemsTotal || 0)) return Number(repair.itemsTotal || 0);
  return repair.items?.length ? repair.items.reduce((sum, item) => sum + parseMoneyInput(item.qty) * parseMoneyInput(item.price), 0) : Number(repair.budget || 0);
}

function itemCostTotal(items = []) {
  return items.reduce((sum, item) => sum + parseMoneyInput(item.qty || 1) * parseMoneyInput(item.cost), 0);
}

function repairCostAmount(repair) {
  if (repair.itemsLoaded === false && Number(repair.itemsCostTotal || 0)) return Number(repair.itemsCostTotal || 0);
  const itemCost = itemCostTotal(repair.items || []);
  return itemCost || Number(repair.costAmount || 0);
}

function chargeAmount(repair) {
  if (repair.orderType === "warranty" && !repair.warrantyChargeable) return 0;
  return Math.max(0, repairAmount(repair) - Number(repair.discountAmount || 0));
}

function isCanceledRepair(repairOrStatus) {
  const status = typeof repairOrStatus === "string" ? repairOrStatus : repairOrStatus?.status;
  return normalizeStatus(status) === "取消";
}

function isCompletedRepairStatus(status) {
  return ["完成", "已取走"].includes(normalizeStatus(status));
}

function isPickedUpRepairStatus(status) {
  return normalizeStatus(status) === "已取走";
}

function shouldShowWarrantyDates(repair) {
  return (repair?.orderType || "repair") !== "warranty" && isPickedUpRepairStatus(repair?.status) && !hasWarrantySkipped(repair);
}

function shouldPrintWarrantyDocument(repair) {
  return (repair?.orderType || "repair") === "warranty" || shouldShowWarrantyDates(repair);
}

function warrantyDays(settings = {}) {
  const explicitDays = Number(settings?.defaultWarrantyDays);
  const legacyMonths = Number(settings?.defaultWarrantyMonths);
  const days = Number.isFinite(explicitDays) && explicitDays > 0
    ? explicitDays
    : Number.isFinite(legacyMonths) && legacyMonths > 0
      ? legacyMonths * 30
      : 90;
  return Math.max(1, Math.round(days));
}

function warrantyPeriodLabel(days, t) {
  return `${days} ${t("dayLabel")}`;
}

function warrantyEndDate(start, settings = {}) {
  if (!start) return "";
  const date = new Date(String(start).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + warrantyDays(settings));
  return formatDateTime(date);
}

function parseRepairDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value) {
  const date = parseRepairDate(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function daysUntil(value) {
  const date = parseRepairDate(value);
  if (!date) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function latestStatusAt(repair, status) {
  const normalized = normalizeStatus(status);
  const history = Array.isArray(repair?.statusHistory) ? repair.statusHistory : [];
  return history
    .filter((entry) => normalizeStatus(entry?.status) === normalized && entry?.at)
    .map((entry) => entry.at)
    .pop() || "";
}

function repairClientNotice(repair, settings = {}, t = makeT("zh")) {
  if ((repair?.orderType || "repair") === "warranty") return null;
  const status = normalizeStatus(repair?.status);
  if (status === "已取走") {
    if (!shouldShowWarrantyDates(repair)) return null;
    const pickupDate = repair.warrantyStart || latestStatusAt(repair, "已取走") || repair.repairTime || "";
    if (!pickupDate) return null;
    const endDate = warrantyEndDate(pickupDate, settings);
    const expired = parseRepairDate(endDate)?.getTime() < Date.now();
    return {
      type: expired ? "expired" : "warranty",
      text: t(expired ? "warrantyExpiredNotice" : "warrantyActiveNotice", { days: expired ? daysSince(pickupDate) : daysUntil(endDate), date: endDate || "-" })
    };
  }
  if (status === "完成") {
    const completedDate = latestStatusAt(repair, "完成") || repair.warrantyStart || repair.repairTime || "";
    return { type: "pickup", text: t("completedNotPickedNotice", { days: daysSince(completedDate) }) };
  }
  return null;
}

function parseMoneyInput(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function isMoneyInputValid(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return false;
  if (!/^(?:\d+\.?\d{0,2}|\.\d{1,2})$/.test(normalized)) return false;
  return Number.isFinite(Number(normalized));
}

function appendMoneyInputKey(current, key) {
  if (key === "clear") return "";
  if (key === "backspace") return String(current || "").slice(0, -1);
  const value = String(current || "");
  if (key === "." && /[.,]/.test(value)) return value;
  const next = `${value}${key}`;
  if (!/^\d*[.,]?\d{0,2}$/.test(next)) return value;
  return next.replace(/^0+(\d)/, "$1");
}

function reportRange(preset = "month", customStart = "", customEnd = "") {
  const today = new Date();
  const start = new Date(today);
  if (preset === "custom") {
    if (customStart && customEnd && customStart > customEnd) return { start: customEnd, end: customStart };
    return { start: customStart || "", end: customEnd || "" };
  }
  if (preset === "today") return { start: dateOnly(today), end: dateOnly(today) };
  if (preset === "yesterday") {
    start.setDate(today.getDate() - 1);
    return { start: dateOnly(start), end: dateOnly(start) };
  }
  if (preset === "last7Days") {
    start.setDate(today.getDate() - 6);
  } else if (preset === "last14Days") {
    start.setDate(today.getDate() - 13);
  } else if (preset === "week") {
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
  } else if (preset === "year") {
    start.setMonth(0, 1);
  } else {
    start.setDate(1);
  }
  return { start: dateOnly(start), end: dateOnly(today) };
}

function repairDateRange(preset = "today") {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  if (preset === "yesterday") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (preset === "dayBeforeYesterday") {
    start.setDate(today.getDate() - 2);
    end.setDate(today.getDate() - 2);
  } else if (preset === "last7Days") {
    start.setDate(today.getDate() - 6);
  } else if (preset === "lastMonth") {
    start.setMonth(today.getMonth() - 1);
  } else if (preset === "last14Days") {
    start.setDate(today.getDate() - 13);
  } else if (preset === "week") {
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
  } else if (preset === "month") {
    start.setDate(1);
  } else if (preset === "year") {
    start.setMonth(0, 1);
  }
  return { start: dateOnly(start), end: dateOnly(end) };
}

function formatDateTimeDisplay(value, lang = "zh") {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(lang === "es" ? "es-ES" : "zh-CN", { hour12: false });
}

function dateOnly(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function topBy(items, keyFn, amountFn, options = {}) {
  const map = new Map();
  for (const item of items) {
    const name = keyFn(item);
    const current = map.get(name) || { name, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amountFn(item);
    map.set(name, current);
  }
  const rows = [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount || String(a.name || "").localeCompare(String(b.name || "")));
  return options.limit === 0 ? rows : rows.slice(0, options.limit || 10);
}

function revenueTrendRows(orders = [], amountFn = () => 0, granularity = "day") {
  const rows = new Map();
  for (const repair of orders) {
    const date = parseRepairDate(repair.repairTime || repair.createdAt);
    if (!date) continue;
    const key = trendKey(date, granularity);
    const current = rows.get(key) || { key, label: trendLabel(date, granularity), count: 0, amount: 0, time: date.getTime() };
    current.count += 1;
    current.amount += amountFn(repair);
    rows.set(key, current);
  }
  return [...rows.values()].sort((a, b) => a.time - b.time).slice(-36);
}

function trendKey(date, granularity) {
  if (granularity === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (granularity === "week") {
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  }
  return dateOnly(date);
}

function trendLabel(date, granularity) {
  if (granularity === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (granularity === "week") return `${trendKey(date, "week")} W`;
  return dateOnly(date);
}

function repairMatchesTechnicianKey(repair, technicianKey, technicianById = new Map()) {
  const technicianName = (repair.technicianName || "").trim();
  const hasKnownTechnician = repair.technicianId && technicianById.has(repair.technicianId);
  if (technicianKey === "unassigned") return !hasKnownTechnician && !technicianName;
  if (technicianKey.startsWith("id:")) {
    const technicianId = technicianKey.slice(3);
    const technician = technicianById.get(technicianId);
    return repair.technicianId === technicianId || Boolean(technician?.name && !hasKnownTechnician && technicianName.toLowerCase() === technician.name.toLowerCase());
  }
  if (technicianKey.startsWith("name:")) return !hasKnownTechnician && technicianName.toLowerCase() === technicianKey.slice(5).toLowerCase();
  return false;
}

function isDeletableHistoricalTechnicianRow(row, t = makeT("zh")) {
  if (!row || row.technician || !String(row.id || "").startsWith("name:")) return false;
  return row.name === t("historicalTechnician") || row.id === "name:历史";
}

function technicianNameLookup(technicians = []) {
  const map = new Map();
  for (const technician of technicians || []) {
    const name = String(technician.name || "").trim().toLowerCase();
    if (name && !map.has(name)) map.set(name, technician);
  }
  return map;
}

function repairTechnicianLabel(repair, technicianById = new Map(), technicianByName = new Map(), t = makeT("zh")) {
  const knownTechnician = technicianById.get(repair.technicianId);
  if (knownTechnician?.name) return knownTechnician.name;
  const legacyName = String(repair.technicianName || "").trim();
  const namedTechnician = legacyName ? technicianByName.get(legacyName.toLowerCase()) : null;
  return namedTechnician?.name || legacyName || t("unassignedTechnician");
}

function isHistoricalAmountRepair() {
  return false;
}

function technicianSummaryRows(repairs = [], technicians = [], t = makeT("zh")) {
  const rows = new Map();
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);
  const makeRow = (id, name, isUnassigned = false) => ({
    id,
    name,
    isUnassigned,
    orderCount: 0,
    repairCount: 0,
    warrantyCount: 0,
    amount: 0,
    cost: 0,
    profit: 0
  });
  const ensureRow = (repair) => {
    const technician = technicianById.get(repair.technicianId);
    if (technician) {
      const key = `id:${technician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, technician.name || t("technician")));
      return rows.get(key);
    }
    const legacyName = String(repair.technicianName || "").trim();
    const namedTechnician = technicianByName.get(legacyName.toLowerCase());
    if (namedTechnician) {
      const key = `id:${namedTechnician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, namedTechnician.name || t("technician")));
      return rows.get(key);
    }
    if (legacyName) {
      const key = `name:${legacyName}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, legacyName));
      return rows.get(key);
    }
    const key = "unassigned";
    if (!rows.has(key)) rows.set(key, makeRow(key, t("unassignedTechnician"), true));
    return rows.get(key);
  };
  for (const repair of repairs) {
    if (isCanceledRepair(repair)) continue;
    const row = ensureRow(repair);
    const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
    const amount = skipAmount ? 0 : chargeAmount(repair);
    const cost = skipAmount ? 0 : repairCostAmount(repair);
    row.orderCount += 1;
    if ((repair.orderType || "repair") === "warranty") row.warrantyCount += 1;
    else row.repairCount += 1;
    row.amount += amount;
    row.cost += cost;
    row.profit += amount - cost;
  }
  return [...rows.values()]
    .filter((row) => row.orderCount)
    .sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned) || b.profit - a.profit || b.amount - a.amount || b.orderCount - a.orderCount || a.name.localeCompare(b.name));
}

function technicianDashboardRows(data, t = makeT("zh"), selectedDate = "") {
  const rows = new Map();
  const technicians = data.technicians || [];
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);
  const dateFilter = String(selectedDate || "").slice(0, 10);
  const makeRow = (key, name, technician = null, isUnassigned = false) => ({
    id: key,
    name,
    technician,
    isUnassigned,
    repairCount: 0,
    warrantyCount: 0,
    recordCount: 0,
    openCount: 0,
    repairAmount: 0,
    repairProfit: 0,
    warrantyLoss: 0,
    latestRepair: null
  });
  for (const technician of technicians) {
    rows.set(`id:${technician.id}`, makeRow(`id:${technician.id}`, technician.name || t("technician"), technician));
  }
  const ensureRow = (repair) => {
    const technician = technicianById.get(repair.technicianId);
    if (technician) {
      const key = `id:${technician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, technician.name || t("technician"), technician));
      return rows.get(key);
    }
    const legacyName = (repair.technicianName || "").trim();
    const namedTechnician = technicianByName.get(legacyName.toLowerCase());
    if (namedTechnician) {
      const key = `id:${namedTechnician.id}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, namedTechnician.name || t("technician"), namedTechnician));
      return rows.get(key);
    }
    if (legacyName) {
      const key = `name:${legacyName}`;
      if (!rows.has(key)) rows.set(key, makeRow(key, legacyName));
      return rows.get(key);
    }
    const key = "unassigned";
    if (!rows.has(key)) rows.set(key, makeRow(key, t("unassignedTechnician"), null, true));
    return rows.get(key);
  };
  for (const repair of data.repairs || []) {
    const status = normalizeStatus(repair.status);
    const repairDate = String(repair.repairTime || "").slice(0, 10);
    if (status === "取消" || (dateFilter && repairDate !== dateFilter)) continue;
    const row = ensureRow(repair);
    const isWarranty = (repair.orderType || "repair") === "warranty";
    const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
    const amount = skipAmount || isWarranty && !repair.warrantyChargeable ? 0 : chargeAmount(repair);
    const cost = skipAmount ? 0 : repairCostAmount(repair);
    const profit = amount - cost;
    row.recordCount += 1;
    if (!row.latestRepair || String(repair.repairTime || repair.ticket || "").localeCompare(String(row.latestRepair.repairTime || row.latestRepair.ticket || "")) > 0) {
      row.latestRepair = repair;
    }
    if (isWarranty) {
      row.warrantyCount += 1;
      row.warrantyLoss += Math.max(0, cost - amount);
    } else {
      row.repairCount += 1;
      row.repairAmount += amount;
      row.repairProfit += profit;
    }
    if (!isLockingFinalStatus(status)) row.openCount += 1;
  }
  return [...rows.values()]
    .filter((row) => row.technician || row.repairCount || row.warrantyCount || row.openCount)
    .sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned) || b.repairProfit - a.repairProfit || b.repairAmount - a.repairAmount || b.repairCount - a.repairCount || a.name.localeCompare(b.name));
}

function technicianStats(repairs, technicians, amountFn, costFn = () => 0, t = makeT("zh")) {
  const map = new Map();
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const technicianByName = technicianNameLookup(technicians);
  for (const technician of technicians || []) {
    map.set(`id:${technician.id}`, { id: `id:${technician.id}`, name: technician.name || t("technician"), count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 });
  }
  for (const repair of repairs) {
    const legacyName = (repair.technicianName || "").trim();
    const technician = technicianById.get(repair.technicianId) || technicianByName.get(legacyName.toLowerCase());
    const name = technician?.name || legacyName || t("unassignedTechnician");
    const key = technician?.id ? `id:${technician.id}` : legacyName ? `name:${legacyName}` : "unassigned";
    const current = map.get(key) || { id: key, name, count: 0, amount: 0, cost: 0, profit: 0, received: 0, unpaid: 0 };
    const skipAmount = isHistoricalAmountRepair(repair, technicianById, technicianByName);
    const amount = skipAmount ? 0 : amountFn(repair);
    const cost = skipAmount ? 0 : costFn(repair);
    const received = Math.min(amount, repairPaidAmount(repair));
    current.count += 1;
    current.amount += amount;
    current.cost += cost;
    current.profit += amount - cost;
    current.received += received;
    current.unpaid += Math.max(0, amount - received);
    map.set(key, current);
  }
  return [...map.values()]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name));
}

function id() {
  return crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatDateTime(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toDateTimeInput(value) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function fromDateTimeInput(value) {
  return value ? value.replace("T", " ") : "";
}

function mountedOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function localNetworkOrigin() {
  return mountedOrigin();
}

function buildPublicStatusUrl(settings, publicToken) {
  const base = String(settings?.publicBaseUrl || localNetworkOrigin() || mountedOrigin() || "").trim().replace(/\/+$/, "");
  const path = `/status/${encodeURIComponent(publicToken)}?slug=${encodeURIComponent(activeShopSlug || "default")}`;
  return base ? `${base}${path}` : path;
}

function whatsappTemplateValue(settings) {
  const value = String(settings?.whatsappProgressTemplate || "").trim();
  if (!value || value === LEGACY_WHATSAPP_PROGRESS_TEMPLATE) return DEFAULT_WHATSAPP_PROGRESS_TEMPLATE;
  return settings.whatsappProgressTemplate;
}

function normalizeWhatsappPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

function buildWhatsappProgressMessage(settings, repair, client, publicUrl) {
  const template = String(whatsappTemplateValue(settings));
  const lang = getLang(settings);
  const device = [repair?.brand, repair?.model].filter(Boolean).join(" / ");
  const shop = String(settings?.shopName || "").trim() || APP_DISPLAY_NAME;
  const status = statusLabel(repair?.status || "", lang);
  return template
    .replaceAll("{url}", publicUrl || "")
    .replaceAll("{ticket}", repair?.ticket || "")
    .replaceAll("{name}", client?.name || repair?.clientName || "")
    .replaceAll("{device}", device)
    .replaceAll("{shop}", shop)
    .replaceAll("{status}", status);
}

function buildReceiptWhatsappMessage(settings, repair, client, { total = 0, paidTotal = 0, due = 0, publicUrl = "" } = {}) {
  const name = client?.name || repair?.clientName || "";
  const device = [repair?.brand, repair?.model].filter(Boolean).join(" / ");
  const shop = String(settings?.shopName || "").trim() || APP_DISPLAY_NAME;
  return [
    `Hola ${name},`,
    "",
    `Somos ${shop}. Le enviamos el resumen de su ticket:`,
    `Nº de orden: ${repair?.ticket || ""}`,
    `Equipo: ${device}`,
    `Total: ${money(total)}`,
    `Pagado: ${money(paidTotal)}`,
    `Pendiente: ${money(due)}`,
    "Resumen de ticket para su comprobante.",
    publicUrl ? `Seguimiento: ${publicUrl}` : "",
    "",
    "Gracias."
  ].filter((line) => line !== "").join("\n");
}

function buildWhatsappUrl(phone, message) {
  const number = normalizeWhatsappPhone(phone);
  const query = `text=${encodeURIComponent(message || "")}`;
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`;
}

function buildProgressEmailUrl(email, repair, message) {
  const subject = `${APP_DISPLAY_NAME} ${repair?.ticket || ""}`.trim();
  const query = new URLSearchParams({
    subject,
    body: message || ""
  });
  return `mailto:${encodeURIComponent(email || "")}?${query.toString()}`;
}

async function createReceiptImageDownload(repair, client, { total = 0, paidTotal = 0, due = 0, publicUrl = "", qrDataUrl = "", settings = {} } = {}) {
  if (typeof document === "undefined") return false;
  try {
    const lang = getLang(settings);
    const t = makeT(lang);
    const shopName = String(settings?.shopName || "").trim() || APP_DISPLAY_NAME;
    const device = [repair?.brand, repair?.model].filter(Boolean).join(" / ");
    const description = repairPrintProblemLabel(repair, lang) || repair?.issue || "";
    const items = Array.isArray(repair?.items) ? repair.items.filter((item) => item?.name) : [];
    const qrSource = qrDataUrl || (publicUrl ? await QRCode.toDataURL(publicUrl, { width: 180, margin: 1 }).catch(() => "") : "");
    const qrImage = qrSource ? await loadCanvasImage(qrSource).catch(() => null) : null;
    const dpr = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const width = 720;
    const maxHeight = 2200;
    const canvas = document.createElement("canvas");
    canvas.width = width * dpr;
    canvas.height = maxHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, maxHeight);
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "top";

    const x = 44;
    const right = width - 44;
    let y = 38;
    const line = (color = "#e5e7eb") => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      y += 18;
    };
    const text = (value, size = 24, weight = 500, color = "#111827", maxWidth = right - x, lineHeight = Math.round(size * 1.34)) => {
      ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle = color;
      y = drawWrappedText(ctx, String(value || ""), x, y, maxWidth, lineHeight);
      return y;
    };
    const row = (label, value, { strong = false } = {}) => {
      ctx.font = "500 22px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(String(label || ""), x, y);
      ctx.font = `${strong ? 800 : 650} 22px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle = "#111827";
      ctx.textAlign = "right";
      ctx.fillText(String(value || ""), right, y);
      ctx.textAlign = "left";
      y += 34;
    };

    text(shopName, 34, 850);
    if (settings?.shopAddress) text(settings.shopAddress, 19, 500, "#4b5563");
    if (settings?.phone) text(`${t("phone")}: ${settings.phone}`, 19, 500, "#4b5563");
    y += 12;
    line("#d1d5db");
    text(t("receiptTitle"), 26, 800);
    row(t("ticket"), repair?.ticket || "-");
    row(t("date"), repair?.repairTime || formatDateTime(new Date()));
    y += 4;
    line();
    text(t("clientSection"), 21, 800, "#374151");
    row(t("name"), client?.name || repair?.clientName || "-");
    row(t("phone"), client?.phone || repair?.phone || "-");
    y += 4;
    line();
    text(t("repairSection"), 21, 800, "#374151");
    row(t("status"), statusLabel(repair?.status || "", lang));
    row(t("device"), device || "-");
    if (description) {
      text(description, 22, 650, "#111827", right - x, 31);
      y += 4;
    }
    line();

    if (items.length) {
      text(t("itemName"), 21, 800, "#374151");
      for (const item of items.slice(0, 12)) {
        const qty = parseMoneyInput(item.qty || 1);
        const price = parseMoneyInput(item.price);
        const itemTotal = qty * price;
        const itemY = y;
        text(item.name, 20, 600, "#111827", right - x - 128, 28);
        ctx.font = "700 18px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = "#111827";
        ctx.textAlign = "right";
        ctx.fillText(`${qty} x ${money(price)}`, right, itemY);
        ctx.fillText(money(itemTotal), right, itemY + 26);
        ctx.textAlign = "left";
        y = Math.max(y + 8, itemY + 62);
      }
      line();
    }

    row(t("totalPrint"), money(total), { strong: true });
    row(t("depositPrint"), money(paidTotal), { strong: true });
    row(t("due"), money(due), { strong: true });
    if (publicUrl || qrImage) {
      y += 10;
      line();
      text(t("qrTitle"), 21, 800, "#374151");
      if (qrImage) {
        ctx.drawImage(qrImage, x, y, 126, 126);
        if (publicUrl) {
          const oldY = y;
          y += 8;
          ctx.save();
          ctx.translate(148, 0);
          text(publicUrl, 18, 600, "#374151", right - x - 148, 26);
          ctx.restore();
          y = Math.max(oldY + 136, y + 10);
        } else {
          y += 136;
        }
      } else if (publicUrl) {
        text(publicUrl, 18, 600, "#374151", right - x, 26);
      }
    }
    y += 12;
    text("Gracias.", 22, 750, "#111827");
    const finalHeight = Math.min(maxHeight, Math.ceil(y + 38));
    const output = document.createElement("canvas");
    output.width = width * dpr;
    output.height = finalHeight * dpr;
    output.getContext("2d").drawImage(canvas, 0, 0, width * dpr, finalHeight * dpr, 0, 0, width * dpr, finalHeight * dpr);
    const link = document.createElement("a");
    link.href = output.toDataURL("image/png");
    link.download = `repairnote-ticket-${String(repair?.ticket || Date.now()).replace(/[^\w.-]+/g, "-")}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}

function drawWrappedText(ctx, value, x, y, maxWidth, lineHeight) {
  const words = String(value || "").split(/(\s+)/).filter((part) => part.trim());
  if (!words.length) return y + lineHeight;
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = "";
    }
    if (ctx.measureText(word).width > maxWidth) {
      for (const char of Array.from(word)) {
        const charTest = line ? `${line}${char}` : char;
        if (ctx.measureText(charTest).width > maxWidth && line) {
          ctx.fillText(line, x, y);
          y += lineHeight;
          line = char;
        } else {
          line = charTest;
        }
      }
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function createNotification(email, status, repair) {
  const at = formatDateTime(new Date());
  const statusEs = statusLabel(status, "es");
  const device = [repair.brand, repair.model].filter(Boolean).join(" ");
  const content = repairContentLabel(repair, "es");
  return {
    email,
    status,
    at,
    notified: false,
    subject: `${APP_DISPLAY_NAME} ${repair.ticket || ""}: estado actualizado a ${statusEs}`,
    body: `Hola,\n\nEl estado de su orden se ha actualizado a: ${statusEs}.\nEquipo: ${device || "-"}\nDetalle: ${content || "-"}\nFecha: ${at}\n\nGracias.`
  };
}

function isLockingFinalStatus(status) {
  return ["已取走", "取消"].includes(normalizeStatus(status));
}

function isOrderLockEnabled(settings = {}) {
  return settings?.enableOrderLock !== false;
}

function isOrderLocked(repair, settings = {}) {
  if (!isOrderLockEnabled(settings)) return false;
  if (!isLockingFinalStatus(repair?.status)) return false;
  const history = Array.isArray(repair?.statusHistory) ? repair.statusHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index] || {};
    if (item.type === "order-unlocked") return false;
    if (item.type === "order-locked") return true;
  }
  return true;
}

function appendOrderLockEvent(history, type, at = formatDateTime(new Date())) {
  return [...(Array.isArray(history) ? history : []), { type, at }];
}

function appendWarrantySkippedEvent(history, at = formatDateTime(new Date())) {
  const rows = Array.isArray(history) ? history : [];
  if (rows.some((item) => item?.type === "warranty-skipped")) return rows;
  return [...rows, { type: "warranty-skipped", at }];
}

function hasWarrantySkipped(repair) {
  return (Array.isArray(repair?.statusHistory) ? repair.statusHistory : []).some((item) => item?.type === "warranty-skipped");
}

function withStatusChange(repair, status, client, settings = {}) {
  const nextStatus = normalizeStatus(status);
  if (normalizeStatus(repair.status) === nextStatus) return repair;
  const at = formatDateTime(new Date());
  let statusHistory = [...(repair.statusHistory || []), { status: nextStatus, at }];
  if (isOrderLockEnabled(settings) && isLockingFinalStatus(nextStatus)) statusHistory = appendOrderLockEvent(statusHistory, "order-locked", at);
  const next = {
    ...repair,
    status: nextStatus,
    statusHistory
  };
  const email = client?.email || "";
  if (email) {
    next.notificationLog = [...(repair.notificationLog || []), createNotification(email, nextStatus, next)];
  }
  return next;
}

async function compressImage(file) {
  const dataUrl = await readFileDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSize = 1000;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function printRepair(mode, repair, client, context = {}) {
  const hasReservedPrintWindow = Object.prototype.hasOwnProperty.call(context || {}, "printWindow");
  const win = hasReservedPrintWindow ? context.printWindow : openPrintWindow();
  if (!win) return false;
  const printKind = context.printKind || "";
  const includeProgressQr = printKind === "warranty" ? false : printKind === "repair" ? true : !shouldPrintWarrantyDocument(repair);
  const qrDataUrl = includeProgressQr ? context.qrDataUrl || (context.publicUrl ? await QRCode.toDataURL(context.publicUrl, { width: 180, margin: 1 }).catch(() => "") : "") : "";
  const html = buildPrintHtml(mode, repair, client, { ...context, qrDataUrl });
  try {
    if (win.closed) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    const closeAfterPrint = () => window.setTimeout(() => {
      if (!win.closed) win.close();
    }, 120);
    win.onafterprint = closeAfterPrint;
    win.addEventListener?.("afterprint", closeAfterPrint, { once: true });
    await waitForPrintAssets(win);
    win.focus();
    win.print();
    return true;
  } catch {
    return false;
  }
}

function openPrintWindow() {
  return window.open("", "_blank", "width=900,height=900");
}

async function waitForPrintAssets(win) {
  const doc = win?.document;
  if (!doc) return;
  const images = Array.from(doc.images || []);
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    if (typeof image.decode === "function") return image.decode().catch(() => {});
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
  await doc.fonts?.ready?.catch?.(() => {});
}

function buildPrintHtml(mode, repair, client, { subtotal, total, due, qrDataUrl, publicUrl, settings, copies = 2, printKind = "" }) {
  const narrow = mode === "receipt";
  const lang = getLang(settings);
  const t = makeT(lang);
  const printsWarrantyDocument = printKind === "warranty" || (printKind !== "repair" && shouldPrintWarrantyDocument(repair));
  const rows = (repair.items || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td class="num">${item.qty}</td><td class="num">${money(parseMoneyInput(item.price))}</td><td class="num">${money(parseMoneyInput(item.qty) * parseMoneyInput(item.price))}</td></tr>`).join("");
  const photos = narrow ? "" : [repair.frontPhoto, repair.backPhoto].filter(Boolean).map((src) => `<img class="photo" src="${src}" />`).join("");
  const terms = printTermsForRepair(repair, settings, printKind);
  const signatureImage = repair.signatureDataUrl ? `<img class="signature-img" src="${repair.signatureDataUrl}" />` : "";
  const shopName = settings?.shopName || APP_DISPLAY_NAME;
  const taxRate = Number(settings?.taxRate ?? 21);
  const taxable = taxRate ? total / (1 + taxRate / 100) : total;
  const taxAmount = Math.max(0, total - taxable);
  const ticket = repair.ticket || "";
  const docTitle = printDocumentTitle(repair, t, printKind);
  const barcode = code39Svg(ticket);
  const technicianLine = !settings?.hideIssuer && repair.technicianName ? `<div>${t("technician")}: ${escapeHtml(repair.technicianName)}</div>` : "";
  const printWarrantyStart = printsWarrantyDocument ? (repair.warrantyStart || repair.repairTime || "") : "";
  const printWarrantyEnd = warrantyEndDate(printWarrantyStart, settings);
  const printWarrantyInfo = printWarrantyStart ? `<div>${t("warrantyStart")}: ${escapeHtml(printWarrantyStart)}</div><div>${t("warrantyEnd")}: ${escapeHtml(printWarrantyEnd)}</div><div>${t("warrantyPeriod")}: ${escapeHtml(warrantyPeriodLabel(warrantyDays(settings), t))}</div>` : "";
  const acceptedTerms = narrow ? t("acceptedTermsCompact") : t("acceptedTerms");
  const showFinalPaymentLine = !printsWarrantyDocument && normalizeStatus(repair.status) !== "已取走";
  const repairDescription = repairContentLabel(repair, lang) || repair.issue || "";
  const repairProblem = repairPrintProblemLabel(repair, lang) || "-";
  const repairNote = localizeText(repair.issue || "", lang).trim();
  const repairProblemLine = repairProblem && repairProblem !== repairNote ? `<div>${t("printProblem")}: ${escapeHtml(repairProblem)}</div>` : "";
  const repairNoteLine = repairNote ? `<div class="print-note">${t("repairNote")}: ${escapeHtml(repairNote)}</div>` : "";
  const imeiPrintLine = repair.imei ? `<div>${escapeHtml(repair.imei || "")}</div>` : "";
  const clientInfo = narrow
    ? `<div>${t("name")}: ${escapeHtml(client.name || repair.clientName || "")}</div><div>${t("phone")}: ${escapeHtml(client.phone || repair.phone || "")}</div>`
    : `<div>${t("name")}: ${escapeHtml(client.name || repair.clientName || "")}</div><div>${t("phone")}: ${escapeHtml(client.phone || repair.phone || "")}</div><div>${t("address")}: ${escapeHtml(client.address || repair.address || "")}</div><div>${t("identity")}: ${escapeHtml(client.identity || repair.identity || "")}</div>`;
  const repairInfo = narrow
    ? `<div>${t("date")}: ${escapeHtml(repair.repairTime || "")}</div><div>${t("status")}: ${escapeHtml(statusLabel(repair.status || "", lang))}</div><div>${t("device")}: ${escapeHtml(repair.brand || "")} ${escapeHtml(repair.model || "")}</div>${imeiPrintLine}${repairProblemLine || (!repairNoteLine ? `<div>${t("printProblem")}: ${escapeHtml(repairProblem)}</div>` : "")}${repairNoteLine}`
    : `<div>${t("date")}: ${escapeHtml(repair.repairTime || "")}</div><div>${t("status")}: ${escapeHtml(statusLabel(repair.status || "", lang))}</div><div>${t("device")}: ${escapeHtml(repair.brand || "")} ${escapeHtml(repair.model || "")}</div>${imeiPrintLine}<div>${t("passwordPrint")}: ${escapeHtml(repair.passwordType === "Contraseña" ? repair.passwordText : repair.passwordType || "")}</div>${technicianLine}${printWarrantyInfo}${repairNoteLine}`;
  const repairLine = narrow ? "" : `<div class="repair-line"><span>${escapeHtml(repairDescription)}</span><b>${money(total)}</b></div>`;
  const sheetContent = `
  <div class="print-meta"><span>${escapeHtml(formatDateTime(new Date()))}</span><span>${escapeHtml(docTitle)}</span></div>
  <header class="doc-head">
    <section class="shop">
      <h1>${escapeHtml(shopName)}</h1>
      ${settings?.shopAddress ? `<div>${t("address")}: ${escapeHtml(settings.shopAddress)}</div>` : ""}
      ${settings?.shopTaxId ? `<div>${t("shopTaxId")}: ${escapeHtml(settings.shopTaxId)}</div>` : ""}
      ${settings?.phone ? `<div>${t("phone")}: ${escapeHtml(settings.phone)}</div>` : ""}
    </section>
    <section class="codes">
      <div class="barcode"><div>${barcode}</div><div class="ticket-no">${escapeHtml(ticket)}</div></div>
      ${qrDataUrl ? `<div class="qr-box"><img class="qr" src="${qrDataUrl}" /><div class="qr-caption">${t("scanProgress")}</div></div>` : ""}
    </section>
  </header>
  <section class="section"><h2>${t("clientSection")}</h2><div class="info-grid client-info-grid">${clientInfo}</div></section>
  <section class="section"><h2>${t("repairSection")}</h2><div class="info-grid">${repairInfo}</div>${repairLine}</section>
  <table><thead><tr><th>${t("itemName")}</th><th class="num">${t("qty")}</th><th class="num">${t("unitPrice")}</th><th class="num">${t("subtotal")}</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="tax-grid"><div><span>${t("taxableBase")}</span><b>${money(taxable)}</b></div><div><span>IVA</span><b>${taxRate.toFixed(2)} %</b></div><div><span>${t("taxQuota")}</span><b>${money(taxAmount)}</b></div><div><span>${t("totalPrint")}</span><b>${money(total)}</b></div></section>
  ${showFinalPaymentLine ? `<section class="final-total"><span><em>${t("depositPrint")}</em><b>${money(repair.deposit)}</b></span><span><em>${t("due")}</em><b>${money(due)}</b></span></section>` : ""}
  ${photos ? `<section class="section"><h2>${t("photos")}</h2>${photos}</section>` : ""}
  ${terms ? `<div class="terms">${escapeHtml(terms)}</div>` : ""}
  <div class="accepted">${acceptedTerms}</div>
  <section class="signature-grid">
    <div class="signature-cell"><div class="signature-label">${t("customerSignature")}</div><div class="signature-line">${signatureImage}</div></div>
  </section>`;
  const receiptCopies = Math.max(1, Math.round(Number(copies) || 1));
  const extraSheets = narrow && receiptCopies > 1 ? Array.from({ length: receiptCopies - 1 }, () => `<main class="sheet receipt-copy-page">${sheetContent}</main>`).join("") : "";
  return `<!doctype html><html lang="${lang === "es" ? "es" : "zh-CN"}"><head><meta charset="utf-8"><title>${escapeHtml(narrow ? t("receiptTitle") : docTitle)}</title><style>
    @page{size:${narrow ? "80mm 297mm" : "A4"};margin:${narrow ? "2mm" : "12mm"}}
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Arial,"PingFang SC",sans-serif;margin:0;padding:${narrow ? "0" : "0"};color:#1d1d1f;background:#fff;-webkit-font-smoothing:antialiased}
    .sheet{width:${narrow ? "76mm" : "186mm"};min-height:${narrow ? "auto" : "273mm"};margin:0 auto;font-size:${narrow ? "11.2px" : "14px"};line-height:${narrow ? "1.22" : "1.38"};overflow-wrap:anywhere}
    .print-meta{display:flex;justify-content:space-between;color:#6e6e73;font-size:${narrow ? "9px" : "12.5px"};margin-bottom:${narrow ? "3px" : "14px"}}
    .doc-head{display:grid;grid-template-columns:${narrow ? "1fr" : "1fr 1.08fr"};gap:${narrow ? "4px" : "18px"};align-items:end;margin-bottom:${narrow ? "5px" : "14px"};padding-bottom:${narrow ? "5px" : "12px"};border-bottom:1px solid #d2d2d7}
    .shop{padding:0}
    .shop h1{font-size:${narrow ? "17px" : "31px"};letter-spacing:0;line-height:1;margin:0 0 ${narrow ? "3px" : "8px"};font-weight:800}.shop div{margin:${narrow ? "1px" : "3px"} 0;color:#515154}
    .codes{display:grid;grid-template-columns:${narrow ? "1fr auto" : "1fr auto"};gap:${narrow ? "6px" : "16px"};align-items:end;text-align:center}.barcode svg{width:100%;max-width:${narrow ? "190px" : "300px"};height:${narrow ? "30px" : "46px"}}.ticket-no{font-size:${narrow ? "11px" : "16px"};font-weight:700;letter-spacing:0.6px;margin-top:${narrow ? "1px" : "4px"}}.qr{width:${narrow ? "46px" : "112px"};height:${narrow ? "46px" : "112px"};display:block;background:#fff}.qr-box{display:flex;flex-direction:column;align-items:center;gap:${narrow ? "1px" : "4px"}}.qr-caption{color:#6e6e73;font-size:${narrow ? "8.5px" : "10.5px"};max-width:${narrow ? "52px" : "120px"}}
    .section{padding:${narrow ? "4px 0" : "11px 0"};margin-top:0;border-bottom:1px solid #e5e5ea}.section h2{color:#6e6e73;font-size:${narrow ? "9.5px" : "12.5px"};letter-spacing:0;text-transform:uppercase;margin:0 0 ${narrow ? "3px" : "8px"};font-weight:700}
    .info-grid{display:grid;grid-template-columns:${narrow ? "1fr" : "1fr 1fr"};gap:${narrow ? "1px" : "5px"} 18px}.client-info-grid{grid-template-columns:1fr 1fr}.info-grid div{min-height:${narrow ? "12px" : "18px"};color:#1d1d1f;min-width:0;overflow-wrap:anywhere}
    .print-note{grid-column:1/-1;white-space:pre-wrap}
    .repair-line{display:flex;justify-content:space-between;gap:${narrow ? "8px" : "16px"};margin-top:${narrow ? "4px" : "9px"};padding-top:${narrow ? "4px" : "9px"};border-top:1px solid #e5e5ea;font-weight:700}.repair-line b{white-space:nowrap}
    table{width:100%;border-collapse:collapse;margin:${narrow ? "4px" : "8px"} 0 0;font-size:${narrow ? "9.8px" : "12.8px"}}th,td{text-align:left;padding:${narrow ? "2.8px 0" : "7px 0"};border-bottom:1px solid #e5e5ea}th{color:#6e6e73;font-weight:700}tr:last-child td{border-bottom:0}.num{text-align:right;white-space:nowrap}
    .tax-grid{display:grid;grid-template-columns:${narrow ? "1.18fr .82fr 1fr 1fr" : "1fr 1fr 1fr 1fr"};gap:${narrow ? "3px" : "8px"};margin-top:${narrow ? "4px" : "8px"};padding:${narrow ? "5px 0" : "12px 0"};border-top:1px solid #d2d2d7;border-bottom:1px solid #d2d2d7}.tax-grid span{display:block;color:#6e6e73;font-size:${narrow ? "8.6px" : "12.3px"};font-weight:800;line-height:1.05}.tax-grid b{display:block;margin-top:${narrow ? "2px" : "5px"};font-size:${narrow ? "11.5px" : "16.5px"};white-space:nowrap}.final-total{display:grid;grid-template-columns:1fr 1fr;gap:${narrow ? "4px" : "10px"};margin-top:0;padding:${narrow ? "3px 0" : "8px 0"};border-bottom:1px solid #d2d2d7;font-weight:800}.final-total em{display:block;color:#1d1d1f;font-size:${narrow ? "9px" : "11.5px"};font-style:normal;line-height:1.05}.final-total b{display:block;margin-top:1px;font-size:${narrow ? "10.5px" : "14px"};white-space:nowrap;line-height:1.05}.final-total span:last-child{justify-self:end;text-align:right}
    .photo{width:${narrow ? "120px" : "180px"};height:auto;margin:6px 8px 6px 0;border:1px solid #e5e5ea}
    .terms{white-space:pre-wrap;font-size:${narrow ? "10.8px" : "12.3px"};margin-top:${narrow ? "7px" : "10px"};color:#3a3a3c;padding:${narrow ? "8px" : "12px"} 0;border-bottom:1px solid #e5e5ea}
    .accepted{font-size:${narrow ? "10.5px" : "13.5px"};font-weight:800;margin:${narrow ? "5px" : "10px"} 0 ${narrow ? "4px" : "8px"};text-transform:uppercase}
    .signature-grid{display:grid;grid-template-columns:1fr;gap:${narrow ? "5px" : "22px"};margin-top:${narrow ? "5px" : "16px"};max-width:${narrow ? "100%" : "88mm"}}
    .signature-cell{display:grid;grid-template-columns:auto 1fr;gap:${narrow ? "6px" : "10px"};align-items:end;break-inside:avoid}
    .signature-line{border-bottom:1.2px solid #1d1d1f;min-height:${narrow ? "18px" : "34px"};display:flex;align-items:flex-end;justify-content:center}
    .signature-img{max-width:${narrow ? "110px" : "150px"};max-height:${narrow ? "24px" : "42px"};display:block;margin:0 auto 2px}
    .signature-label{color:#3a3a3c;font-size:${narrow ? "10px" : "13px"};font-weight:700;white-space:nowrap;text-transform:uppercase}
    .receipt-copy-page{display:block;break-before:page!important;page-break-before:always!important}
    @media print{button{display:none}.sheet{margin:0}.receipt-copy-page{break-before:page!important;page-break-before:always!important}}
  </style></head><body><main class="sheet">${sheetContent}</main>${extraSheets}</body></html>`;
}

function printTermsForRepair(repair, settings = {}, printKind = "") {
  if (printKind === "warranty" || (printKind !== "repair" && shouldPrintWarrantyDocument(repair))) return settings.warrantyTerms || "";
  if (["预定", "预定到货"].includes(normalizeStatus(repair.status))) return settings.reservationTerms || "";
  return settings.repairTerms || "";
}

function printDocumentTitle(repair, t, printKind = "") {
  if (printKind === "warranty" || (printKind !== "repair" && shouldPrintWarrantyDocument(repair))) return t("warrantyDocTitle");
  if (["预定", "预定到货"].includes(normalizeStatus(repair.status))) return t("reservationDocTitle");
  return t("repairDocTitle");
}

function code39Svg(value) {
  const patterns = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
    "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
    F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
    K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
    P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
    U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
    Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
    "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn"
  };
  const encoded = String(value || "").toUpperCase().replace(/[^0-9A-Z ./$+%-]/g, "");
  if (!encoded) return "";
  let x = 0;
  const height = 44;
  const bars = [];
  for (const char of `*${encoded}*`) {
    const pattern = patterns[char] || patterns["0"];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? 4.8 : 1.8;
      if (index % 2 === 0) bars.push(`<rect x="${x.toFixed(1)}" y="0" width="${width}" height="${height}" />`);
      x += width;
    }
    x += 1.8;
  }
  return `<svg viewBox="0 0 ${Math.ceil(x)} ${height}" preserveAspectRatio="none" role="img" aria-label="barcode">${bars.join("")}</svg>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
