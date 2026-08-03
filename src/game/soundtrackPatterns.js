export function getSequenceLength(theme) {
  const hasEventLayers = ["bass", "lead", "pad", "brass", "guitar", "string"].some(
    (layer) => Array.isArray(theme?.[`${layer}Events`]) || Array.isArray(theme?.[`${layer}Pattern`])
  );
  if (hasEventLayers && (theme?.lengthBars || theme?.steps)) {
    return (theme.lengthBars ?? 1) * (theme.steps ?? 16);
  }
  return theme?.steps ?? 8;
}

export function getLayerEvents(theme, layer, stepIndex) {
  const eventList = theme?.[`${layer}Events`] ?? theme?.[`${layer}Pattern`];
  if (!Array.isArray(eventList) || !eventList.length) return [];

  const first = eventList[0];
  if (!first || (typeof first !== "object" || Array.isArray(first))) return [];

  const length = getSequenceLength(theme);
  const step = ((stepIndex % length) + length) % length;
  return eventList.filter((event) => ((event.step ?? 0) % length) === step);
}

export function getStepContent(theme, layer, stepIndex) {
  const events = getLayerEvents(theme, layer, stepIndex);
  if (events.length) {
    return events.map((event) => ({
      notes: event.notes ?? (event.note ? [event.note] : []),
      duration: event.duration ?? "8n",
      velocity: event.velocity ?? theme?.mix?.[layer] ?? 0.5,
    }));
  }

  const pattern = theme?.[layer];
  if (!Array.isArray(pattern)) return [];
  const note = pattern[(stepIndex % pattern.length + pattern.length) % pattern.length];
  if (note == null) return [];

  return [
    {
      notes: Array.isArray(note) ? note : [note],
      duration: theme?.duration ?? "8n",
      velocity: theme?.mix?.[layer] ?? 0.5,
    },
  ];
}
