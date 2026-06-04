(async function () {
  console.log("🚀 Loading PDF extraction script...");

  // 1. Robust Script Loading with Promise & Caching
  const loadJsPDF = () => {
    return new Promise((resolve, reject) => {
      if (window.jspdf) return resolve(window.jspdf);

      const script = document.createElement("script");
      let scriptURL = "https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js";
      
      // ✅ FIXED: Trusted Types handling with try/catch fallback
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
          // Use a unique policy name with timestamp to avoid "policy already exists" errors
          const policyName = `jspdf-loader-${Date.now()}`;
          const policy = window.trustedTypes.createPolicy(policyName, {
            createScriptURL: (input) => {
              // Optional: Add validation here if you want to whitelist domains
              if (input.startsWith("https://unpkg.com/jspdf")) {
                return input;
              }
              throw new Error("Blocked script URL: " + input);
            },
          });
          scriptURL = policy.createScriptURL(scriptURL);
        } catch (e) {
          // Fallback: if policy creation fails, use the raw URL
          // The browser may still block it via CSP, but at least the script won't crash
          console.warn("⚠️ Trusted Types policy creation failed, using raw URL:", e);
        }
      }
      
      script.src = scriptURL;
      script.onload = () => resolve(window.jspdf);
      script.onerror = () => reject(new Error("Failed to load jsPDF library from CDN."));
      script.referrerPolicy = "no-referrer"; // Prevent leaking page context
      document.head.appendChild(script);
    });
  };

  try {
    const { jsPDF } = await loadJsPDF();
    console.log("✅ jsPDF loaded successfully.");

    // 2. Modern Image Discovery
    console.log("🔍 Scanning content for Drive blob images...");
    const validImgs = Array.from(document.querySelectorAll("img")).filter(img => 
      img.src.startsWith("blob:https://drive.google.com/")
    );

    if (validImgs.length === 0) {
      console.warn("⚠️ No valid blob images found. Google may have changed their DOM rendering (e.g., using CSS backgrounds or canvas).");
      return;
    }

    console.log(`📄 Found ${validImgs.length} pages.`);
    console.log("⚙️ Generating PDF (this may take a moment)...");

    // 3. Advanced Filename Sanitization
    let rawTitle = document.querySelector('meta[itemprop="name"]')?.content || document.title || 'download';
    let title = rawTitle
      .replace(/\s*-\s*Google Drive$/i, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim()
      .substring(0, 250); // Prevent overly long filenames
      
    if (!title.toLowerCase().endsWith(".pdf")) title += ".pdf";

    // 4. Memory-Optimized PDF Generation
    let pdf = null;
    const reusableCanvas = document.createElement("canvas");
    const ctx = reusableCanvas.getContext("2d", { alpha: false }); // Disable alpha for slight perf gain

    for (let i = 0; i < validImgs.length; i++) {
      const img = validImgs[i];
      
      try {
        await img.decode();
      } catch (e) {
        console.warn(`⚠️ Failed to decode image ${i + 1}. Skipping...`);
        continue;
      }

      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      if (width === 0 || height === 0) continue;

      const orientation = width > height ? "l" : "p";

      if (i === 0 || !pdf) {
        pdf = new jsPDF({
          orientation,
          unit: "px",
          format: [width, height],
          hotfixes: ["px_scaling"]
        });
      } else {
        pdf.addPage([width, height], orientation);
      }

      reusableCanvas.width = width;
      reusableCanvas.height = height;
      
      try {
        ctx.drawImage(img, 0, 0, width, height);
        pdf.addImage(reusableCanvas, "JPEG", 0, 0, width, height, undefined, "FAST");
      } catch (e) {
        if (e.name === "SecurityError") {
          console.error(`❌ CORS/Tainted canvas error on page ${i + 1}. This blob may not be accessible.`);
        } else {
          console.error(`❌ Error processing page ${i + 1}:`, e);
        }
        continue;
      }

      const percentage = Math.floor(((i + 1) / validImgs.length) * 100);
      console.log(`⏳ Processing page ${i + 1}/${validImgs.length} (${percentage}%)`);
      
      // Yield to main thread to keep UI responsive
      if (i % 5 === 0) { // Yield every 5 pages instead of every page for better perf
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (!pdf || pdf.getNumberOfPages() === 0) {
      console.error("❌ PDF generation failed or no pages were processed.");
      return;
    }

    console.log("💾 Downloading PDF file...");
    await pdf.save(title, { returnPromise: true });
    console.log("✅ PDF downloaded successfully!");

  } catch (error) {
    console.error("❌ Script failed:", error);
    // Optional: Show user-facing error in UI
    if (confirm(`❌ Error: ${error.message}\n\nCheck console for details. Try again?`)) {
      location.reload();
    }
  }
})();
