document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const form = document.getElementById("upload-form")
  const dropArea = document.getElementById("drop-area")
  const fileInput = document.getElementById("pdf-file")
  const fileInfo = document.getElementById("file-info")
  const submitButton = document.getElementById("submit-button")
  const buttonText = document.getElementById("button-text")
  const errorAlert = document.getElementById("error-alert")
  const errorMessage = document.getElementById("error-message")
  const resultCard = document.getElementById("result-card")
  const financialMetrics = document.getElementById("financial-metrics")

  // Progress bar elements
  const progressContainer = document.getElementById("progress-container")
  const progressBarFill = document.getElementById("progress-bar-fill")
  const progressStatus = document.getElementById("progress-status")
  const progressPercentage = document.getElementById("progress-percentage")
  const progressTimeLeft = document.getElementById("progress-time-left")

  // State
  let selectedFile = null
  let isLoading = false
  let progressInterval = null
  let ESTIMATED_TOTAL_TIME = 60 // default fallback
  let startTime = null

  let currentProgress = 0
  let simulationStopped = false

  // Event Listeners
  dropArea.addEventListener("click", () => fileInput.click())

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      stopProgressSimulation()
      selectedFile = e.target.files[0]
      updateFileInfo(selectedFile.name)
      hideError()
      ESTIMATED_TOTAL_TIME = estimateTotalTime(selectedFile) // update time estimate
    }
  })
  ;["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, preventDefaults, false)
  })

  function preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }
  ;["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, highlight, false)
  })
  ;["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, unhighlight, false)
  })

  function highlight() {
    dropArea.classList.add("bg-muted")
  }

  function unhighlight() {
    dropArea.classList.remove("bg-muted")
  }

  dropArea.addEventListener("drop", handleDrop, false)

  function handleDrop(e) {
    const dt = e.dataTransfer
    const files = dt.files
    if (files && files[0]) {
      selectedFile = files[0]
      fileInput.files = dt.files
      updateFileInfo(selectedFile.name)
      hideError()
      ESTIMATED_TOTAL_TIME = estimateTotalTime(selectedFile)
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault()

    const FLOW_ID = "05c28217-bb7d-466e-bee6-9041ff9c9742"
    const LANGFLOW_HOST = "http://35.184.50.162:7860"

    // const FLOW_ID = "98cb2691-9f53-4a4d-a1e6-4a9bcb11e815"
    // const LANGFLOW_HOST = "http://127.0.0.1:7860"

    if (!selectedFile) return showError("Please select a PDF file")
    if (selectedFile.type !== "application/pdf") return showError("Please upload a PDF file")

    setLoading(true)
    clearResults()
    hideError()

    showProgressBar()
    startProgressSimulation()
    updateProgressStatus("Uploading file...")

    try {
      const uploadFormData = new FormData()
      uploadFormData.append("file", selectedFile)
      uploadFormData.append("flow_id", FLOW_ID)

      const uploadRes = await fetch(`${LANGFLOW_HOST}/api/v2/files`, {
        method: "POST",
        body: uploadFormData,
      })
      if (!uploadRes.ok) throw new Error(`File upload failed with status ${uploadRes.status}`)

      const uploadData = await uploadRes.json()
      const filePath = uploadData.path
      const fileId = uploadData.id

      updateProgressStatus("Analyzing...")
      
      const runPayload = {
        output_type: "chat",
        input_type: "chat",
        tweaks: {
          "OCRPDF-zGADG": { path: [filePath] },
          "ChatInput-0o0ja": { input_value: "From the given document text, extract the following information in JSON format: { \"companyName\": \"N/A\", \"turnover\": \"N/A\", \"netWorth\": \"N/A\", \"workingCapital\": \"N/A\" }. Please ensure the values are extracted accurately from the document, and include the currency along with the numerical values where applicable. If any information is not available, keep the value as \\\"N/A\\\". give in millions or billions"}
          // "TextInput-Yz5Ma": {input_value: "From the given document text, extract the following information in JSON format: { \"companyName\": \"N/A\", \"turnover\": \"N/A\", \"netWorth\": \"N/A\", \"workingCapital\": \"N/A\" }. Please ensure the values are extracted accurately from the document, and include the currency along with the numerical values where applicable. If any information is not available, keep the value as \\\"N/A\\\"."}
        },
      }

      const runRes = await fetch(`${LANGFLOW_HOST}/api/v1/run/${FLOW_ID}?stream=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runPayload),
      })
      if (!runRes.ok) throw new Error(`Flow run failed: ${runRes.status}`)
      
      
      updateProgressStatus("Finalizing results...")

      await fetch(`${LANGFLOW_HOST}/api/v2/files/${fileId}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      })

      const runData = await runRes.json()
      setProgress(100)
      simulationStopped = true

      updateProgressStatus("Completed!")
      
      const resultText = runData.outputs?.[0]?.outputs?.[0]?.results?.message?.text ?? "No output generated."
      
      const financialData = parseFinancialData(resultText)
      displayFinancialMetrics(financialData)

      setTimeout(() => hideProgressBar(), 1000)
    } catch (err) {
      showError(err instanceof Error ? err.message : "An unknown error occurred")
      hideProgressBar()
    } finally {
      stopProgressSimulation()
      setLoading(false)
    }
  })

  // Parse the financial data from the result text
  function parseFinancialData(text) {
    try {
      let cleaned = text.trim();

      // Remove unexpected prefixes like 'json' or triple quotes
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
      
      const data = JSON.parse(cleaned);
      return {
        turnover: data.turnover ?? "N/A",
        netWorth: data.netWorth ?? "N/A",
        workingCapital: data.workingCapital ?? "N/A",
      };
    } catch (e) {
      console.error("Failed to parse financial data:", e);
      return {
        turnover: "N/A",
        netWorth: "N/A",
        workingCapital: "N/A",
      };
    }
  }

  // Display the financial metrics with icons
  function displayFinancialMetrics(data) {
    financialMetrics.innerHTML = `
      <div class="metric-card">
        <div class="metric-icon turnover-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <div class="metric-name">Turnover</div>
        <div class="metric-value">${data.turnover}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon networth-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
        </div>
        <div class="metric-name">Net Worth</div>
        <div class="metric-value">${data.netWorth}</div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon workingcapital-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
            <line x1="12" y1="6" x2="12" y2="8"></line>
            <line x1="12" y1="16" x2="12" y2="18"></line>
          </svg>
        </div>
        <div class="metric-name">Working Capital</div>
        <div class="metric-value">${data.workingCapital}</div>
      </div>
    `

    resultCard.classList.remove("hidden")
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // ⏳ Size-based estimated time
  function estimateTotalTime(file) {
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > 5) return 180
    else if (sizeMB > 3) return 120
    else if (sizeMB > 1) return 60
    else return 30
  }

  // 🟢 Progress bar functions
  function showProgressBar() {
    progressContainer.classList.remove("hidden")
  }

  function hideProgressBar() {
    progressContainer.classList.add("hidden")
  }

  function setProgress(percent) {
    // Don't allow simulation to overwrite final backend progress
    if (simulationStopped && percent < currentProgress) return

    currentProgress = percent
    progressBarFill.style.width = `${percent}%`
    progressPercentage.textContent = `${Math.round(percent)}%`
    if (startTime) {
      const elapsed = (Date.now() - startTime) / 1000
      const remaining = Math.max(0, ESTIMATED_TOTAL_TIME - elapsed)
      if (progressTimeLeft) progressTimeLeft.textContent = `${Math.ceil(remaining)} sec left`
    }

    // Stop simulation after backend completes
    if (percent >= 100) {
      simulationStopped = true
    }
  }

  function updateProgressStatus(status) {
    progressStatus.textContent = status
  }

  function startProgressSimulation() {
    if (progressInterval) return // prevent double interval
    simulationStopped = false // reset flag

    startTime = Date.now()
    progressInterval = setInterval(() => {
      if (simulationStopped) return // STOP simulation if backend took over

      const elapsed = (Date.now() - startTime) / 1000
      let simulatedProgress = (elapsed / ESTIMATED_TOTAL_TIME) * 100
      if (simulatedProgress >= 90) simulatedProgress = 90 // OR 95 if you prefer

      if (simulatedProgress > currentProgress) {
        setProgress(simulatedProgress)
      }
    }, 200)
  }

  function stopProgressSimulation() {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null

      simulationStopped = true // ✅ reset for next run
      currentProgress = 0
    }
  }

  // 🔧 Helpers
  function updateFileInfo(fileName) {
    fileInfo.innerHTML = `<p class="text-sm font-medium">${fileName}</p>`
  }

  function resetFileInfo() {
    fileInfo.innerHTML = `
      <p class="text-sm font-medium">Click to upload PDF</p>
      <p class="text-xs text-muted">PDF files only</p>`
  }

  function showError(message) {
    errorMessage.textContent = message
    errorAlert.classList.remove("hidden")
  }

  function hideError() {
    errorAlert.classList.add("hidden")
    errorMessage.textContent = ""
  }

  function setLoading(loading) {
    isLoading = loading
    submitButton.disabled = loading
    buttonText.innerHTML = loading
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner button-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Processing...`
      : "Upload"
  }

  function clearResults() {
    financialMetrics.innerHTML = ""
    resultCard.classList.add("hidden")
  }
})
