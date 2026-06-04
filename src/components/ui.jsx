"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "default", size = "default", ...props }) {
  return (
    <button
      data-slot="button"
      className={cn("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}
      {...props}
    />
  );
}

export function ButtonLink({ className, variant = "default", size = "default", disabled = false, ...props }) {
  return (
    <a
      data-slot="button-link"
      aria-disabled={disabled}
      className={cn("ui-button", `ui-button-${variant}`, `ui-button-${size}`, disabled && "is-disabled", className)}
      {...props}
    />
  );
}

export function TextLink({ className, ...props }) {
  return <a data-slot="text-link" className={className} {...props} />;
}

function selectEditableText(event) {
  const target = event.currentTarget;
  if (target.disabled || target.readOnly) return;
  const type = String(target.type || "").toLowerCase();
  if (["button", "checkbox", "color", "file", "hidden", "radio", "range", "reset", "submit"].includes(type)) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== target) return;
    try {
      target.select();
    } catch {
      // Some browser-native controls, such as date inputs, do not expose select().
    }
  });
}

export function Input({ className, name, placeholder, onFocus, onMouseUp, type = "text", inputMode, ref, ...props }) {
  const fallbackName = typeof placeholder === "string" ? placeholder : undefined;
  const renderedType = type === "number" ? "text" : type;
  const renderedInputMode = inputMode || (type === "number" ? "decimal" : undefined);
  return (
    <input
      data-slot="input"
      className={cn("ui-input", className)}
      type={renderedType}
      inputMode={renderedInputMode}
      ref={ref}
      name={name || fallbackName || "field"}
      placeholder={placeholder}
      onFocus={(event) => {
        onFocus?.(event);
        selectEditableText(event);
      }}
      onMouseUp={(event) => {
        onMouseUp?.(event);
        selectEditableText(event);
        event.preventDefault();
      }}
      {...props}
    />
  );
}

export function Textarea({ className, name, placeholder, onFocus, onMouseUp, ...props }) {
  const fallbackName = typeof placeholder === "string" ? placeholder : undefined;
  return (
    <textarea
      data-slot="textarea"
      className={cn("ui-textarea", className)}
      name={name || fallbackName || "field"}
      placeholder={placeholder}
      onFocus={(event) => {
        onFocus?.(event);
        selectEditableText(event);
      }}
      onMouseUp={(event) => {
        onMouseUp?.(event);
        selectEditableText(event);
        event.preventDefault();
      }}
      {...props}
    />
  );
}

export function SearchInput({ value, onChange, placeholder = "搜索", className }) {
  return (
    <div data-slot="search-input" className={cn("search", className)}>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Select({ className, children, name, value, defaultValue = "", onChange, style, disabled, ...props }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const selectedValue = value ?? internalValue;
  const options = useMemo(() => Children.toArray(children).filter(isValidElement).map((child) => ({
    value: child.props.value ?? "",
    label: child.props.children,
    disabled: child.props.disabled,
    className: child.props.className
  })), [children]);
  const selected = options.find((option) => String(option.value) === String(selectedValue)) || options[0];
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(selectedValue)));
  const triggerStyle = style?.height ? { height: style.height, minHeight: style.height } : undefined;
  const selectValue = (nextValue) => {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.({ target: { name: name || "select", value: nextValue } });
    setOpen(false);
  };
  const selectableIndex = (startIndex, direction) => {
    if (!options.length) return -1;
    for (let step = 0; step < options.length; step += 1) {
      const nextIndex = (startIndex + direction * step + options.length) % options.length;
      if (!options[nextIndex]?.disabled) return nextIndex;
    }
    return -1;
  };
  const moveSelection = (direction) => {
    const nextIndex = selectableIndex(selectedIndex + direction, direction);
    if (nextIndex < 0) return;
    selectValue(options[nextIndex].value);
    setOpen(true);
  };
  const jumpSelection = (startIndex, direction) => {
    const nextIndex = selectableIndex(startIndex, direction);
    if (nextIndex < 0) return;
    selectValue(options[nextIndex].value);
    setOpen(true);
  };
  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      jumpSelection(0, 1);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      jumpSelection(options.length - 1, -1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  };
  useEffect(() => {
    if (!open) return;
    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        right: "auto",
        top: rect.bottom + 6,
        width: rect.width,
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
  }, [open]);
  const menu = open && menuStyle && typeof document !== "undefined" ? createPortal(
    <div className="ui-select-menu" role="listbox" tabIndex={-1} style={menuStyle}>
      {options.map((option) => {
        const active = String(option.value) === String(selectedValue);
        return (
          <button
            data-slot="select-option"
            type="button"
            key={String(option.value)}
            className={cn("ui-select-option", option.className, active && "active")}
            disabled={option.disabled}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectValue(option.value)}
          >
            <span>{option.label}</span>
            {active ? <Check size={14} strokeWidth={1.75} /> : null}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div
      data-slot="select"
      ref={rootRef}
      className={cn("ui-select-wrap", className)}
      style={style}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
      {...props}
    >
      <button
        data-slot="select-trigger"
        ref={triggerRef}
        type="button"
        className="ui-select"
        style={triggerStyle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="ui-select-value">{selected?.label}</span>
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {menu}
    </div>
  );
}

export function Badge({ className, children, ...props }) {
  return (
    <span data-slot="badge" className={cn("ui-badge", className)} {...props}>
      {children}
    </span>
  );
}

export function Card({ className, ...props }) {
  return <section data-slot="card" className={cn("ui-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn("ui-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 data-slot="card-title" className={cn("ui-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p data-slot="card-description" className={cn("ui-card-description", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn("ui-card-content", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div data-slot="card-footer" className={cn("ui-card-footer", className)} {...props} />;
}

export function TableContainer({ className, ...props }) {
  return <div data-slot="table-container" className={cn("table-wrap", className)} {...props} />;
}

export function Table({ className, ...props }) {
  return <table data-slot="table" className={cn("ui-table", className)} {...props} />;
}

export function TableHeader({ className, ...props }) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

export function TableFooter({ className, ...props }) {
  return <tfoot data-slot="table-footer" className={className} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr data-slot="table-row" className={className} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th data-slot="table-head" className={className} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td data-slot="table-cell" className={className} {...props} />;
}

export function DialogHeader({ className, ...props }) {
  return <div data-slot="dialog-header" className={cn("dialog-head", className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("dialog-title", className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("dialog-description", className)} {...props} />;
}

export function DialogBody({ className, ...props }) {
  return <div data-slot="dialog-body" className={cn("dialog-body", className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div data-slot="dialog-footer" className={cn("dialog-actions", className)} {...props} />;
}

export function DialogClose({ className, ...props }) {
  return <DialogPrimitive.Close data-slot="dialog-close" className={cn("dialog-close", className)} {...props} />;
}

export function Toolbar({ className, ...props }) {
  return <div data-slot="toolbar" className={cn("toolbar", className)} {...props} />;
}

export function Empty({ className, compact = false, ...props }) {
  return <div data-slot="empty" className={cn("empty", compact && "compact", className)} {...props} />;
}

export function FieldGroup({ className, ...props }) {
  return <div data-slot="field-group" className={cn("form-grid", className)} {...props} />;
}

export function Field({ className, as: Component = "label", ...props }) {
  return <Component data-slot="field" className={cn("field", className)} {...props} />;
}

export function LabeledField({ className, as: Component = "label", ...props }) {
  return <Component data-slot="field" className={cn("labeled-field", className)} {...props} />;
}

export function FieldIcon({ className, ...props }) {
  return <span data-slot="field-icon" className={cn("icon", className)} {...props} />;
}

export function Checkbox({ className, type = "checkbox", ...props }) {
  return <input data-slot="checkbox" className={cn("ui-checkbox", className)} type={type} {...props} />;
}

export function CheckboxLine({ className, ...props }) {
  return <label data-slot="checkbox-line" className={cn("checkbox-line", className)} {...props} />;
}

export function FormControlLabel({ className, ...props }) {
  return <label data-slot="control-label" className={className} {...props} />;
}

export function Tabs({ className, ...props }) {
  return <div data-slot="tabs" className={cn("tabs", className)} {...props} />;
}

export function TabsTrigger({ className, active = false, type = "button", ...props }) {
  return <button data-slot="tabs-trigger" aria-pressed={active} type={type} className={cn("tab", active && "active", className)} {...props} />;
}

export function NavItem({ className, active = false, mobileOnly = false, dot = false, as: Component = "button", children, ...props }) {
  return (
    <Component data-slot="nav-item" className={cn("side-item", mobileOnly && "mobile-only", active && "active", className)} {...props}>
      {children}
      {dot ? <span className="red-dot" /> : null}
    </Component>
  );
}

export function MobileMenuCard({ className, active = false, type = "button", ...props }) {
  return <button data-slot="mobile-menu-card" type={type} className={cn("mobile-menu-card", active && "active", className)} {...props} />;
}

export function ChipGroup({ className, ...props }) {
  return <div data-slot="chip-group" className={cn("chips", className)} {...props} />;
}

export function Chip({ className, active = false, type = "button", ...props }) {
  return <button data-slot="chip" type={type} className={cn("chip", active && "active", className)} {...props} />;
}

export function CategoryPill({ className, active = false, type = "button", ...props }) {
  return <button data-slot="category-pill" type={type} className={cn("product-category-pill", active && "active", className)} {...props} />;
}

export function BrandItem({ className, active = false, type = "button", ...props }) {
  return <button data-slot="brand-item" type={type} className={cn("brand-item", active && "active", className)} {...props} />;
}

export function ResultButton({ className, active = false, type = "button", ...props }) {
  return <button data-slot="result-button" type={type} className={cn("quick-result", active && "active", className)} {...props} />;
}

export function ColorSwatchButton({ className, active = false, type = "button", color, style, ...props }) {
  return (
    <button
      data-slot="color-swatch-button"
      type={type}
      className={cn("technician-color-option", active && "active", className)}
      style={{ ...style, backgroundColor: color }}
      {...props}
    />
  );
}

export function SegmentedControl({ className, ...props }) {
  return <div data-slot="segmented-control" className={cn("payment-method-segment", className)} {...props} />;
}

export function SegmentedControlItem({ className, active = false, type = "button", ...props }) {
  return <button data-slot="segmented-control-item" type={type} className={cn("payment-method-segment-button", active && "active", className)} {...props} />;
}

export function IconTrigger({ className, type = "button", ...props }) {
  return <button data-slot="icon-trigger" type={type} className={className} {...props} />;
}

export function OptionMenu({ className, ...props }) {
  return <div data-slot="option-menu" className={cn("picker-menu", className)} role="listbox" tabIndex={-1} {...props} />;
}

export function OptionItem({ className, active = false, type = "button", ...props }) {
  return <button data-slot="option-item" type={type} className={cn("picker-option", active && "active", className)} {...props} />;
}

export function ComboField({ value, onChange, options, placeholder, icon, className = "", appendMode = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const normalized = (value || "").toLowerCase();
  const visibleOptions = (options || [])
    .filter(Boolean)
    .filter((option, index, array) => array.indexOf(option) === index)
    .filter((option) => !normalized || option.toLowerCase().includes(normalized) || appendMode)
    .slice(0, 12);
  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(current, 0), Math.max(visibleOptions.length - 1, 0)));
  }, [visibleOptions.length]);
  const choose = (option) => {
    if (appendMode) {
      const current = value || "";
      onChange([current, option].filter(Boolean).join(current ? ", " : ""));
    } else {
      onChange(option);
    }
    setOpen(false);
  };
  const moveActive = (delta) => {
    if (!visibleOptions.length) return;
    setOpen(true);
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return visibleOptions.length - 1;
      if (next >= visibleOptions.length) return 0;
      return next;
    });
  };
  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter" && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      if (open && visibleOptions[activeIndex]) choose(visibleOptions[activeIndex]);
      setOpen(false);
    }
  };

  return (
    <div
      data-slot="combo-field"
      ref={rootRef}
      className={cn("combo-field", className)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Field className="combo-trigger">
        {icon ? <FieldIcon>{icon}</FieldIcon> : null}
        <Input
          value={value || ""}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
          }}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {visibleOptions.length ? (
          <IconTrigger className="combo-toggle" tabIndex={-1} onClick={() => setOpen((current) => !current)} aria-label={`${placeholder}选项`}>
            <ChevronDown size={14} strokeWidth={1.75} />
          </IconTrigger>
        ) : null}
      </Field>
      {open && visibleOptions.length ? (
        <OptionMenu className="combo-menu">
          {visibleOptions.map((option, index) => (
            <OptionItem
              key={option}
              active={index === activeIndex}
              tabIndex={-1}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
            </OptionItem>
          ))}
        </OptionMenu>
      ) : null}
    </div>
  );
}

export function ActionSurface({ className, type = "button", as: Component = "button", ...props }) {
  const componentProps = Component === "button" ? { type, ...props } : props;
  return <Component data-slot="action-surface" className={className} {...componentProps} />;
}

export function DatePresetGroup({ className, ...props }) {
  return <div data-slot="date-preset-group" className={cn("date-preset-group", className)} {...props} />;
}

export function DatePresetButton({ className, active = false, type = "button", ...props }) {
  return <button data-slot="date-preset-button" type={type} className={cn("date-preset-button", active && "active", className)} {...props} />;
}

export function DateClearButton({ className, type = "button", ...props }) {
  return <button data-slot="date-clear-button" type={type} className={cn("date-range-clear", className)} {...props} />;
}

export function NumberStepper({
  value,
  onChange,
  placeholder,
  incrementLabel = "增加数量",
  decrementLabel = "减少数量",
  className,
  inputClassName,
  ...props
}) {
  const step = (delta) => {
    const numericValue = Number.parseFloat(String(value ?? "").replace(",", "."));
    const current = Number.isFinite(numericValue) ? numericValue : 1;
    const next = Math.max(1, Math.round(current + delta));
    onChange(String(next));
  };
  return (
    <div data-slot="number-stepper" className={cn("quantity-stepper", className)} {...props}>
      <Input type="number" className={cn("quantity-stepper-input", inputClassName)} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <div className="quantity-stepper-buttons">
        <button data-slot="number-stepper-increment" type="button" className="quantity-stepper-button" aria-label={incrementLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)}>
          <ChevronUp size={10} strokeWidth={2} />
        </button>
        <button data-slot="number-stepper-decrement" type="button" className="quantity-stepper-button" aria-label={decrementLabel} onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}>
          <ChevronDown size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function PhotoUpload({
  label,
  value,
  onChange,
  onFile,
  emptyLabel = "未上传",
  uploadLabel = "上传",
  deleteLabel = "删除",
  accept = "image/*",
  className
}) {
  return (
    <div data-slot="photo-upload" className={cn("photo-box", className)}>
      <div className="photo-title">{label}</div>
      {value ? <img src={value} alt={label} /> : <div className="photo-empty">{emptyLabel}</div>}
      <div className="photo-actions">
        <ActionSurface as="label" className="ui-button ui-button-outline ui-button-sm">
          {uploadLabel}
          <input hidden type="file" accept={accept} onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const nextValue = onFile ? await onFile(file) : file;
            onChange(nextValue);
            event.target.value = "";
          }} />
        </ActionSurface>
        {value ? <Button size="sm" variant="ghost" onClick={() => onChange("")}>{deleteLabel}</Button> : null}
      </div>
    </div>
  );
}

export function Separator({ className, decorative = true, orientation = "horizontal", ...props }) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={orientation}
      className={cn("ui-separator", orientation === "vertical" && "ui-separator-vertical", className)}
      {...props}
    />
  );
}

export function Dialog({ open, onOpenChange, title, children, contentClassName }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className={cn("dialog-content", contentClassName)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">维修开单系统弹窗表单</DialogDescription>
            <DialogClose aria-label="关闭">
              <X size={16} strokeWidth={1.75} />
            </DialogClose>
          </DialogHeader>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  confirmVariant = "default",
  confirmDisabled = false
}) {
  const close = () => {
    onCancel?.();
    onOpenChange?.(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      title={title}
      contentClassName="confirm-dialog-content"
    >
      <DialogBody className="confirm-dialog">
        <p className="confirm-dialog-message">{message}</p>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={close}>{cancelLabel}</Button>
          <Button variant={confirmVariant === "danger" ? "danger" : "default"} type="button" disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}
