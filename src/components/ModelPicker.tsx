import { useMemo } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import { chatEffortsLabel, type ChatModel } from "../chatDefaults";

export function ModelPicker({ value, models, onChange, className, ariaLabel, disabled }: { value: string; models: ChatModel[]; onChange: (model: string) => void; className?: string; ariaLabel: string; disabled?: boolean }) {
  const filter = Combobox.useFilter();
  const modelById = useMemo(() => new Map(models.map((entry) => [entry.model, entry])), [models]);
  const modelIds = useMemo(() => [...modelById.keys()], [modelById]);
  return <Combobox.Root disabled={disabled} items={modelIds} value={value} onValueChange={(model) => { if (model) onChange(model); }}
    itemToStringLabel={(model) => modelById.get(model)?.displayName ?? model}
    filter={(model, query) => filter.contains(`${model} ${modelById.get(model)?.displayName ?? ""}`, query)}>
    <Combobox.Label className="sr-only">{ariaLabel}</Combobox.Label>
    <Combobox.Trigger className={`${className ?? ""} model-picker-trigger`}>
      <span className="model-picker-value"><Combobox.Value placeholder="Select model" /></span>
      <Combobox.Icon className="shrink-0"><ChevronDown size={14} /></Combobox.Icon>
    </Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner align="start" sideOffset={4} className="isolate z-[110]">
      <Combobox.Popup className="ios-select-content model-picker-popup outline-none" aria-label={ariaLabel}>
        <Combobox.Input placeholder="Filter models" aria-label={`Filter ${ariaLabel}`} spellCheck={false} autoCorrect="off" autoCapitalize="none" className="model-picker-input" />
        <Combobox.Empty className="model-picker-empty">No models match.</Combobox.Empty>
        <Combobox.List className="model-picker-list outline-none">{(model: string) => {
          const entry = modelById.get(model);
          return <Combobox.Item key={model} value={model} className="model-picker-item grid w-full grid-cols-[14px_1fr] items-center gap-2 rounded px-2 py-1.5 text-left text-sm"><Combobox.ItemIndicator className="col-start-1"><Check size={14} /></Combobox.ItemIndicator><span className="col-start-2 truncate">{entry?.displayName ?? model}{entry ? chatEffortsLabel(entry) : ""}</span></Combobox.Item>;
        }}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
}
