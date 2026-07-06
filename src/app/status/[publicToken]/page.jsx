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

function publicStatusLabel(status, lang) {
  const normalized = normalizePublicStatus(status);
  return publicStatusLabels[lang]?.[normalized] || publicStatusLabels.zh[normalized] || normalized || "-";
}

function statusProgress(status) {
  const normalized = normalizePublicStatus(status);
  if (normalized === "取消") return 100;
  const index = statusSteps.indexOf(normalized);
  if (index < 0) return 20;
  return Math.round(((index + 1) / statusSteps.length) * 100);
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

export default async function PublicStatusPage({ params, searchParams }) {
  const { publicToken } = await params;
  const { slug } = await searchParams;
  const shopSlug = String(slug || "").trim().toLowerCase();
  const repair = /^[a-z0-9][a-z0-9-]{0,62}$/.test(shopSlug) ? await prisma.repair.findFirst({
    where: { publicToken, shop: { slug: shopSlug } },
    select: {
      status: true,
      brand: true,
      model: true,
      repairTime: true,
      warrantyStart: true,
      shop: { select: { name: true, active: true } }
    }
  }) : null;
  const lang = "zh";
  const text = lang === "es"
    ? {
      title: "Estado de reparación",
      notFoundTitle: "Código no disponible",
      notFound: "No hemos encontrado esta reparación. Contacta con la tienda y facilita el número del ticket.",
      device: "Dispositivo",
      receivedAt: "Fecha de recepción",
      promisedAt: "Fecha prometida",
      shop: "Tienda",
      status: "Estado",
      progress: "Progreso",
      defaultHint: "Tu reparación está registrada. La tienda actualizará el estado cuando haya novedades.",
      waitingHint: "El equipo está en cola de revisión o pendiente de inicio.",
      repairingHint: "El técnico está trabajando en el equipo.",
      readyHint: "La reparación está terminada. Puedes contactar con la tienda para recoger el equipo.",
      deliveredHint: "El equipo ya figura como entregado.",
      closedHint: "La orden está cancelada. Contacta con la tienda si necesitas más información.",
      contactHint: "Para cualquier consulta, contacta con la tienda."
    }
    : {
      title: "维修进度",
      notFoundTitle: "二维码不可用",
      notFound: "没有找到这张维修单。请联系店铺，并提供纸质单据上的单号。",
      device: "设备",
      receivedAt: "接收日期",
      promisedAt: "承诺日期",
      shop: "门店",
      status: "状态",
      progress: "维修进度",
      defaultHint: "维修单已登记，店铺会在有进展时更新状态。",
      waitingHint: "设备正在排队检测或等待开始维修。",
      repairingHint: "维修师正在处理这台设备。",
      readyHint: "维修已完成，可以联系店铺确认取机。",
      deliveredHint: "设备已标记为客户取走。",
      closedHint: "订单已取消。如需继续咨询，请联系店铺。",
      contactHint: "如需咨询，请联系门店。"
    };

  if (!repair || repair.shop?.active === false) {
    return (
      <main className="public-status">
        <section className="public-card public-card-empty">
          <div className="public-kicker">{APP_DISPLAY_NAME}</div>
          <h1>{text.notFoundTitle}</h1>
          <p className="public-muted">{text.notFound}</p>
        </section>
      </main>
    );
  }

  const progress = statusProgress(repair.status);

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
          <div className="public-summary-meta">
            <span><b>{text.shop}</b>{repair.shop.name}</span>
            <span><b>{text.device}</b>{repair.brand} / {repair.model}</span>
            <span><b>{text.status}</b>{publicStatusLabel(repair.status, lang)}</span>
            <span><b>{text.receivedAt}</b>{repair.repairTime || "-"}</span>
            <span><b>{text.promisedAt}</b>{repair.warrantyStart || "-"}</span>
          </div>
        </section>

        <footer className="public-footer">
          <p>{text.contactHint}</p>
        </footer>
      </section>
    </main>
  );
}
