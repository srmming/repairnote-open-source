import { prisma } from "@/lib/prisma";
import "@/app/globals.css";

const APP_DISPLAY_NAME = "repuestomovil";
const statusSteps = ["预定", "预定到货", "维修中", "完成", "已取走"];
const publicStatusLabels = {
  zh: {
    预定: "预定",
    预定到货: "预定到货",
    维修中: "维修中",
    完成: "完成",
    已取走: "已取走",
    取消: "取消"
  },
  es: {
    预定: "Reserva",
    预定到货: "Reserva llegado",
    维修中: "Reparando",
    完成: "Finalizado",
    已取走: "Entregado",
    取消: "Cancelar"
  }
};

const publicServiceZhMap = {
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

const publicServiceEsMap = Object.fromEntries(Object.entries(publicServiceZhMap).map(([es, zh]) => [zh, es]));


function normalizePublicStatus(status) {
  const map = {
    "预定已到货": "预定到货",
    "Reserva recibida": "预定到货",
    "Reserva llegado": "预定到货",
    "待开始": "预定",
    "En espera": "预定",
    "Pendiente": "预定",
    "En reparación": "维修中",
    "Reparando": "维修中",
    "Terminado": "完成",
    "Finalizado": "完成",
    "Entregado": "已取走",
    "关闭": "取消",
    "Cerrado": "取消",
    "Cancelar": "取消",
    "待检测": "预定",
    "处理中": "维修中",
    "等客户确认": "预定到货",
    "已完成": "完成",
    "拒保": "取消"
  };
  return map[status] || status || "预定";
}

function publicLang(settings = {}) {
  const explicitPublicLang = settings.publicLanguage || settings.publicStatusLanguage || settings.customerLanguage;
  return explicitPublicLang === "zh" ? "zh" : "es";
}

function publicStatusLabel(status, lang) {
  const normalized = normalizePublicStatus(status);
  return publicStatusLabels[lang]?.[normalized] || publicStatusLabels.zh[normalized] || normalized || "-";
}

function publicLocalizeText(value, lang = "zh") {
  const source = String(value || "");
  if (lang === "es") {
    return Object.entries(publicServiceEsMap)
      .sort((a, b) => b[0].length - a[0].length)
      .reduce((text, [from, to]) => text.replaceAll(from, to), source)
      .split("，")
      .map((part) => part.trim())
      .join(", ");
  }
  const entries = Object.entries(publicServiceZhMap).sort((a, b) => b[0].length - a[0].length);
  return entries.reduce((text, [from, to]) => text.replaceAll(from, to), source);
}

function statusProgress(status) {
  const normalized = normalizePublicStatus(status);
  if (normalized === "取消") return 100;
  const index = statusSteps.indexOf(normalized);
  if (index < 0) return 20;
  return Math.round(((index + 1) / statusSteps.length) * 100);
}

function maskName(name = "") {
  if (!name) return "";
  if (name.length <= 2) return `${name[0] || ""}*`;
  return `${name.slice(0, 1)}${"*".repeat(Math.min(2, name.length - 1))}`;
}


function paymentTotal(payments = []) {
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function repairPaidAmount(repair) {
  const payments = Array.isArray(repair.payments) ? repair.payments : [];
  const paid = paymentTotal(payments);
  return payments.length ? paid : Number(repair.deposit || 0);
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function statusHint(status, text) {
  const normalized = normalizePublicStatus(status);
  if (normalized === "完成") return text.readyHint;
  if (normalized === "已取走") return text.deliveredHint;
  if (normalized === "取消") return text.closedHint;
  if (normalized === "预定" || normalized === "预定到货") return text.waitingHint;
  if (normalized === "维修中") return text.repairingHint;
  return text.defaultHint;
}

export default async function PublicStatusPage({ params }) {
  const { publicToken } = await params;
  const repair = await prisma.repair.findUnique({
    where: { publicToken },
    include: { shop: true, client: true, items: true, payments: true }
  });
  const settings = repair?.shop?.active === false ? null : await prisma.setting.findUnique({ where: { shopId_key: { shopId: repair?.shopId || "default-shop", key: "main" } } });
  const lang = publicLang(settings?.value || {});
  const phone = settings?.value?.phone || "";
  const text = lang === "es"
    ? {
      title: "Estado de reparación",
      notFoundTitle: "Código no disponible",
      notFound: "No hemos encontrado esta reparación. Contacta con la tienda y facilita el número del ticket.",
      ticket: "Ticket Nº",
      client: "Cliente",
      device: "Dispositivo",
      issue: "Incidencia",
      items: "Productos / servicios",
      qty: "Cant.",
      price: "Precio",
      subtotal: "Subtotal",
      updatedAt: "Última actualización",
      due: "Pendiente",
      technician: "Técnico",
      contact: "Contacto",
      status: "Estado",
      noIssue: "Sin descripción de reparación",
      frontPhoto: "Foto frontal",
      backPhoto: "Foto trasera",
      progress: "Progreso",
      defaultHint: "Tu reparación está registrada. La tienda actualizará el estado cuando haya novedades.",
      waitingHint: "El equipo está en cola de revisión o pendiente de inicio.",
      repairingHint: "El técnico está trabajando en el equipo.",
      readyHint: "La reparación está terminada. Puedes contactar con la tienda para recoger el equipo.",
      deliveredHint: "El equipo ya figura como entregado.",
      closedHint: "La orden está cancelada. Contacta con la tienda si necesitas más información.",
      contactHint: "Para cualquier consulta, indica el número de ticket."
    }
    : {
      title: "维修进度",
      notFoundTitle: "二维码不可用",
      notFound: "没有找到这张维修单。请联系店铺，并提供纸质单据上的单号。",
      ticket: "单号",
      client: "客户",
      device: "设备",
      issue: "维修内容",
      items: "商品 / 服务",
      qty: "数量",
      price: "价格",
      subtotal: "小计",
      updatedAt: "更新时间",
      due: "待收款",
      technician: "维修师",
      contact: "联系方式",
      status: "状态",
      noIssue: "暂无维修内容",
      frontPhoto: "正面照片",
      backPhoto: "背面照片",
      progress: "维修进度",
      defaultHint: "维修单已登记，店铺会在有进展时更新状态。",
      waitingHint: "设备正在排队检测或等待开始维修。",
      repairingHint: "维修师正在处理这台设备。",
      readyHint: "维修已完成，可以联系店铺确认取机。",
      deliveredHint: "设备已标记为客户取走。",
      closedHint: "订单已取消。如需继续咨询，请联系店铺。",
      contactHint: "如需咨询，请联系店铺并提供维修单号。"
    };

  if (!repair || repair.shop?.active === false) {
    return (
      <main className="public-status">
        <section className="public-card public-card-empty">
          <div className="public-kicker">{APP_DISPLAY_NAME}</div>
          <h1>{text.notFoundTitle}</h1>
          <p className="public-muted">{text.notFound}</p>
          {phone ? <a className="public-contact-button" href={`tel:${phone}`}>{text.contact}：{phone}</a> : null}
        </section>
      </main>
    );
  }

  const total = repair.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0) || Number(repair.budget || 0);
  const due = Math.max(0, total - Number(repair.discountAmount || 0) - repairPaidAmount(repair));
  const progress = statusProgress(repair.status);
  const itemRows = repair.items.length
    ? repair.items.map((item) => ({ name: publicLocalizeText(item.name, lang), qty: Number(item.qty || 0), price: Number(item.price || 0) }))
    : [{ name: publicLocalizeText(repair.issue || text.noIssue, lang), qty: 1, price: total }];
  const photos = [
    { label: text.frontPhoto, src: repair.frontPhoto },
    { label: text.backPhoto, src: repair.backPhoto }
  ].filter((photo) => photo.src);

  return (
    <main className="public-status">
      <section className="public-card public-repair-card">
        <header className="public-hero">
          <div>
            <div className="public-kicker">{APP_DISPLAY_NAME}</div>
            <h1>{text.title}</h1>
            <p>{statusHint(repair.status, text)}</p>
          </div>
          <div className="public-status-pill">{publicStatusLabel(repair.status, lang)}</div>
        </header>

        <div className="public-progress" aria-label={text.progress}>
          <div className="public-progress-head">
            <span>{text.progress}</span>
            <b>{progress}%</b>
          </div>
          <div className="public-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="public-steps">
            {statusSteps.map((step) => <span key={step} className={progress >= statusProgress(step) ? "active" : ""}>{publicStatusLabel(step, lang)}</span>)}
          </div>
        </div>

        <section className="public-repair-summary">
          <div className="public-summary-copy">
            <span>{text.items}</span>
            <div className="public-item-list">
              {itemRows.map((item, index) => (
                <div className="public-item-row" key={`${item.name}-${index}`}>
                  <strong>{item.name || text.noIssue}</strong>
                  <span>{text.qty}: {item.qty || 1}</span>
                  <b>{money((item.qty || 1) * item.price)}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="public-summary-meta">
            <span><b>{text.device}</b>{repair.brand} / {repair.model}</span>
            <span><b>{text.status}</b>{publicStatusLabel(repair.status, lang)}</span>
          </div>
          {photos.length ? (
            <div className="public-photo-grid">
              {photos.map((photo) => (
                <figure key={photo.label} className="public-photo">
                  <img src={photo.src} alt={photo.label} />
                  <figcaption>{photo.label}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </section>

        <dl className="public-info-grid">
          <div><dt>{text.ticket}</dt><dd>{repair.ticket}</dd></div>
          <div><dt>{text.client}</dt><dd>{maskName(repair.client?.name || "")}</dd></div>
          <div><dt>{text.technician}</dt><dd>{repair.technicianName || "-"}</dd></div>
          <div><dt>{text.updatedAt}</dt><dd>{repair.updatedAt.toLocaleString(lang === "es" ? "es-ES" : "zh-CN")}</dd></div>
          <div><dt>{text.due}</dt><dd>{due.toFixed(2)} €</dd></div>
          <div><dt>{text.contact}</dt><dd>{phone || "-"}</dd></div>
        </dl>

        <footer className="public-footer">
          <p>{text.contactHint}</p>
          {phone ? <a className="public-contact-button" href={`tel:${phone}`}>{phone}</a> : null}
        </footer>
      </section>
    </main>
  );
}
