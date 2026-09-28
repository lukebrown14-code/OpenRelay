export const STATES = {
  idle: "idle",
  loading: "loading",
  ready: "ready",
  failed: "failed",
}

export function createStatusWidget(root, fetchStatus) {
  root.textContent = ""

  const loading = document.createElement("div")
  loading.className = "widget-loading"
  loading.textContent = "Loading status…"
  loading.hidden = true

  const data = document.createElement("div")
  data.className = "widget-data"
  data.hidden = true

  const error = document.createElement("div")
  error.className = "widget-error"
  error.hidden = true

  root.appendChild(loading)
  root.appendChild(data)
  root.appendChild(error)

  let state = STATES.idle

  function show(block) {
    for (const el of [loading, data, error]) el.hidden = el !== block
  }

  function renderData(report) {
    data.textContent = ""
    const title = document.createElement("div")
    title.className = "widget-title"
    title.textContent = `Status (${report.updatedAt})`
    data.appendChild(title)
    for (const svc of report.services) {
      const row = document.createElement("div")
      row.className = "widget-row"
      row.textContent = `${svc.name}: ${svc.state} (${svc.latencyMs}ms)`
      data.appendChild(row)
    }
  }

  async function load() {
    state = STATES.loading
    show(loading)
    try {
      const report = await fetchStatus()
      renderData(report)
      state = STATES.ready
      show(data)
    } catch (err) {
      // TODO: the widget must surface load failures instead of spinning forever.
      state = STATES.loading
    }
    return state
  }

  return {
    load,
    get state() {
      return state
    },
    blocks: { loading, data, error },
  }
}
