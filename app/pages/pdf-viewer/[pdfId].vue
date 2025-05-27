<template>
  <div class="pdf-viewer-container">
    <div v-if="isLoading" class="loading-message">Loading PDF data...</div>
    <div v-if="error" class="error-message">
      <p>An error occurred:</p>
      <pre>{{ error instanceof Error ? error.message : JSON.stringify(error) }}</pre>
      <p v-if="String(error).includes('API base URL is not configured')">
        Please ensure the <code>apiBaseUrl</code> is correctly set in <code>nuxt.config.ts</code>.
      </p>
    </div>

    <template v-if="!isLoading && !error">
      <div class="pdf-display-area">
        <!-- PDF will be rendered here -->
        <canvas id="pdf-canvas"></canvas>
      </div>
      <div class="text-input-area">
        <h3>Extracted Text</h3>
        <div v-if="boundingBoxes.length > 0" class="space-y-2">
          <div v-for="box in boundingBoxes" :key="box.element_id">
            <label :for="'input-' + box.element_id" class="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Field {{ box.element_id }}
            </label>
            <UInput
              :id="'input-' + box.element_id"
              v-model="box.text"
              placeholder="Text from PDF"
            />
          </div>
        </div>
        <p v-else>
          No bounding boxes found for this PDF.
        </p>
      </div>
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Script setup for future logic
import { ref, onMounted, watch } from 'vue'; // Add watch
import { useRoute, useRuntimeConfig } from '#app'; // Or 'nuxt/app'
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import 'pdfjs-dist/web/pdf_viewer.css'; // If basic styling is desired

interface BoundingBox {
  element_id: string; // Changed from id
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

const route = useRoute();
const config = useRuntimeConfig();
const pdfId = ref(route.params.pdfId as string);
const apiBaseUrl = config.public.apiBaseUrl as string;

const boundingBoxes = ref<BoundingBox[]>([]); // Replace sampleBoundingBoxes
const pdfFileUrl = ref<string | null>(null); // To store the cloudStoragePath
const isLoading = ref<boolean>(true);
const error = ref<any>(null);

// Store the PDF page's viewport, as it's needed for coordinate scaling
const pdfPageView = ref<any>(null); // To store the PDFPageProxy.getViewport output

// PDF.js Worker Setup (ensured it's at top level)
(async () => {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) { // Check if already set
      const workerSrcModule = await import('pdfjs-dist/build/pdf.worker.min.js?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcModule.default || workerSrcModule;
    }
  } catch (e) {
    console.error('Error setting up PDF.js worker:', e);
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) { // Fallback if dynamic import fails
       pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;
    }
  }
})();


async function fetchPdfData(id: string) {
  isLoading.value = true;
  error.value = null;
  try {
    if (apiBaseUrl === 'REPLACE_WITH_YOUR_ACTUAL_API_BASE_URL' || !apiBaseUrl) {
      throw new Error('API base URL is not configured in nuxt.config.ts. Please replace the placeholder.');
    }
    // First API call for metadata and bounding boxes
    const metadataUrl = `${apiBaseUrl}/documents/${id}`;
    // Note: useFetch is a Nuxt composable. If it's not automatically available in this context
    // or causes issues, standard fetch() would be the alternative.
    // Assuming useFetch is appropriate here as per Nuxt environment.
    const { data: metadataResponse, error: fetchErrorVal } = await useFetch<any>(metadataUrl);

    if (fetchErrorVal.value) {
      throw new Error(`Error fetching metadata: ${fetchErrorVal.value.statusMessage || fetchErrorVal.value.message || fetchErrorVal.value}`);
    }
    if (!metadataResponse.value) {
      throw new Error('No data returned from metadata API.');
    }

    pdfFileUrl.value = metadataResponse.value.cloudStoragePath;
    boundingBoxes.value = metadataResponse.value.boundingBoxes.map((box: any) => ({
        ...box,
        element_id: box.element_id || box.id // Handle if API uses 'id'
    }));

    if (!pdfFileUrl.value) {
      throw new Error('PDF cloud storage path not provided in API response.');
    }

    await loadAndRenderPdf(pdfFileUrl.value);

  } catch (e) {
    console.error('Error in fetchPdfData:', e);
    error.value = e;
    boundingBoxes.value = [];
    pdfFileUrl.value = null;
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
  } finally {
    isLoading.value = false;
  }
}

async function loadAndRenderPdf(url: string) {
  const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
  if (!canvas) {
    error.value = 'Canvas element not found.';
    console.error(error.value);
    return;
  }
  const context = canvas.getContext('2d');

  if (!context) {
    console.error('Failed to get canvas context');
    error.value = 'Failed to get canvas context';
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);

  try {
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1); // Assuming first page
    const viewport = page.getViewport({ scale: 1.5 });
    pdfPageView.value = viewport;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;
    console.log('PDF rendered successfully from URL:', url);
    drawBoundingBoxes(); // Now uses fetched boundingBoxes

    // Add click event listener to the canvas (moved here to ensure canvas is ready)
    canvas.removeEventListener('click', handleCanvasClick); // Remove previous if any
    canvas.addEventListener('click', handleCanvasClick);


  } catch (e) {
    console.error('Error loading/rendering PDF:', e);
    error.value = `Failed to load PDF: ${e instanceof Error ? e.message : String(e)}`;
  }
}

onMounted(() => {
  // Worker setup is now at the top level IIFE.
  // Initial fetch
  if (pdfId.value) {
    fetchPdfData(pdfId.value);
  }
});

// Watch for changes in pdfId
watch(() => route.params.pdfId, (newId) => {
  if (newId && typeof newId === 'string' && newId !== pdfId.value) {
    pdfId.value = newId;
    boundingBoxes.value = [];
    pdfFileUrl.value = null;
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
    pdfPageView.value = null;
    // Clear previous error when navigating
    error.value = null;
    isLoading.value = true; // Set loading true for new PDF
    fetchPdfData(newId);
  }
}, { immediate: false }); // 'immediate: false' because onMounted handles initial load

function handleCanvasClick(event: MouseEvent) {
  const canvas = event.target as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const viewport = pdfPageView.value;
  if (!viewport) return;

  for (const box of boundingBoxes.value) { // Use boundingBoxes
    const canvasX = box.x * viewport.scale;
    const canvasY = box.y * viewport.scale;
    const canvasWidth = box.width * viewport.scale;
    const canvasHeight = box.height * viewport.scale;

    if (x >= canvasX && x <= canvasX + canvasWidth &&
        y >= canvasY && y <= canvasY + canvasHeight) {
      console.log(`Clicked on box: ${box.element_id}`); // Use element_id
      const inputElement = document.getElementById(`input-${box.element_id}`); // Use element_id
      if (inputElement) {
        inputElement.focus();
      }
      return;
    }
  }
}

function drawBoundingBoxes() {
  const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
   if (!canvas) return; // Guard if canvas not found
  const context = canvas.getContext('2d');
  const viewport = pdfPageView.value;

  if (!context || !viewport) {
    // Do not log error if loading, as canvas might not be ready / PDF not loaded
    if (!isLoading.value) {
      console.error('Canvas context or PDF page view not available for drawing bounding boxes.');
    }
    return;
  }

  context.strokeStyle = 'red';
  context.lineWidth = 2;

  boundingBoxes.value.forEach(box => { // Use boundingBoxes
    const canvasX = box.x * viewport.scale;
    const canvasY = box.y * viewport.scale;
    const canvasWidth = box.width * viewport.scale;
    const canvasHeight = box.height * viewport.scale;
    context.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
  });
  console.log('Bounding boxes drawn.');
}
</script>

<style scoped>
/* Existing styles remain here */
.pdf-viewer-container {
  display: flex;
  height: 100vh;
}
.pdf-display-area {
  flex-grow: 1;
  border-right: 1px solid #e0e0e0; /* Softer border color */
  overflow: auto;
  position: relative; /* For positioning bounding boxes */
  background-color: #f0f0f0; /* Light background for the PDF area itself */
}
.text-input-area {
  width: 300px; /* Adjust as needed */
  padding: 20px; /* Increased padding */
  overflow-y: auto;
  background-color: #fdfdfd; /* Slightly off-white background for sidebar */
  /* border-left was removed as .pdf-display-area already has a border-right */
}
.text-input-area h3 {
  margin-top: 0; /* Remove default margin if any */
  margin-bottom: 15px; /* Space below heading */
  font-size: 1.1em; /* Slightly larger font */
  color: #333; /* Darker text for heading */
}
#pdf-canvas {
  display: block; /* Remove extra space below canvas */
  margin: 0 auto; /* Center canvas if it's narrower than display area */
}
.loading-message, .error-message {
  padding: 20px;
  text-align: center;
  width: 100%; /* Ensure they take full width if replacing content */
}
.error-message {
  color: red;
  border: 1px solid red;
  margin: 10px auto; /* Centered margin */
  background-color: #ffe0e0;
  max-width: 800px; /* Prevent it from being too wide */
}
.error-message pre {
  white-space: pre-wrap; /* Allow text wrapping */
  word-break: break-all; /* Break long strings */
  text-align: left;
  padding: 10px;
  background-color: #fff0f0;
  border-radius: 4px;
  margin-top: 10px;
  max-height: 300px; /* Limit height for very long errors */
  overflow-y: auto; /* Scroll for long errors */
}
</style>
