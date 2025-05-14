document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('upload-form');
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('pdf-file');
    const fileInfo = document.getElementById('file-info');
    const submitButton = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    const resultCard = document.getElementById('result-card');
    const extractedText = document.getElementById('extracted-text');
  
    // API Endpoints - Replace these with your actual endpoints
    const UPLOAD_API = "https://your-backend-api.com/upload-to-s3";
    const LAMBDA_API = "https://77dz8auipb.execute-api.us-east-1.amazonaws.com/pdf-image/";
  
    // State
    let selectedFile = null;
    let isLoading = false;
  
    // Event Listeners
    dropArea.addEventListener('click', () => {
      fileInput.click();
    });
  
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedFile = e.target.files[0];
        updateFileInfo(selectedFile.name);
        hideError();
      }
    });
  
    // Drag and drop functionality
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropArea.addEventListener(eventName, preventDefaults, false);
    });
  
    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  
    ['dragenter', 'dragover'].forEach(eventName => {
      dropArea.addEventListener(eventName, highlight, false);
    });
  
    ['dragleave', 'drop'].forEach(eventName => {
      dropArea.addEventListener(eventName, unhighlight, false);
    });
  
    function highlight() {
      dropArea.classList.add('bg-muted');
    }
  
    function unhighlight() {
      dropArea.classList.remove('bg-muted');
    }
  
    dropArea.addEventListener('drop', handleDrop, false);
  
    function handleDrop(e) {
      const dt = e.dataTransfer;
      const files = dt.files;
      
      if (files && files[0]) {
        selectedFile = files[0];
        fileInput.files = dt.files;
        updateFileInfo(selectedFile.name);
        hideError();
      }
    }
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      const FLOW_ID = "05c28217-bb7d-466e-bee6-9041ff9c9742";
      const LANGFLOW_HOST = "https://35.184.50.162:7860";
  
      if (!selectedFile) {
        showError("Please select a PDF file");
        return;
      }
  
      if (selectedFile.type !== "application/pdf") {
        showError("Please upload a PDF file");
        return;
      }
  
      setLoading(true);
      clearResults();
      hideError();
  
      try {
        // ✅ STEP 1: Upload file globally via /api/v2/files/upload
        const uploadFormData = new FormData();
        uploadFormData.append("file", selectedFile);
        uploadFormData.append("flow_id", FLOW_ID);
  
        const uploadRes = await fetch(`${LANGFLOW_HOST}/api/v2/files`, {
          method: "POST",
          body: uploadFormData,
        });
  
        if (!uploadRes.ok) {
          throw new Error(`File upload failed with status ${uploadRes.status}`);
        }
  
        const uploadData = await uploadRes.json();
        const filePath = uploadData.path; // <-- this is what we want
        const fileId = uploadData.id;
        console.log("✅ Uploaded to Langflow (global v2):", filePath);
  
        // ✅ STEP 2: Call run API with tweaks
        const runPayload = {
          output_type: "chat",
          input_type: "chat",
          tweaks: {
            // 👇 MAKE SURE THESE ARE YOUR EXACT NODE IDS
            "OCRPDF-zGADG": {
              path: [filePath] // <--- note array syntax
            },
            "ChatInput-0o0ja": {
              input_value: "Extract turnover, net worth, and working capital from this document"
            }
          }
        };
  
        const runRes = await fetch(`${LANGFLOW_HOST}/api/v1/run/${FLOW_ID}?stream=false`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(runPayload)
        });
  
        console.log(runRes);
        
        if (!runRes.ok) {
          throw new Error(`Flow run failed: ${runRes.status}`);
        }

        // Delete the file thats created
        await fetch(`${LANGFLOW_HOST}/api/v2/files/${fileId}`, {
          method: "DELETE",
          headers: {
              "accept": "application/json"
          }
        });
      
  
        const runData = await runRes.json();
  
        // ✅ Extract result (assumes standard response format)
        const resultText = runData.outputs?.[0]?.outputs?.[0]?.results?.message?.text ?? "No output generated.";
        showResults(resultText);
  
      } catch (err) {
        showError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
  });
  
    // Helper Functions
    function updateFileInfo(fileName) {
      fileInfo.innerHTML = `
        <p class="text-sm font-medium">${fileName}</p>
      `;
    }
  
    function resetFileInfo() {
      fileInfo.innerHTML = `
        <p class="text-sm font-medium">Click to upload PDF</p>
        <p class="text-xs text-muted">PDF files only</p>
      `;
    }
  
    function showError(message) {
      errorMessage.textContent = message;
      errorAlert.classList.remove('hidden');
    }
  
    function hideError() {
      errorAlert.classList.add('hidden');
      errorMessage.textContent = '';
    }
  
    function setLoading(loading) {
      isLoading = loading;
      submitButton.disabled = loading;
      
      if (loading) {
        buttonText.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinner button-icon">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          Fetching the data...
        `;
      } else {
        buttonText.textContent = 'Extract Text';
      }
    }
  
    function showResults(text) {
      extractedText.textContent = text;
      resultCard.classList.remove('hidden');
      // Scroll to results
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  
    function clearResults() {
      extractedText.textContent = '';
      resultCard.classList.add('hidden');
    }
  });