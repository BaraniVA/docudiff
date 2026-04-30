# DocDiff - Document Analysis Platform

A modern, AI-powered document comparison and analysis application designed for professional-grade revision tracking and regulatory compliance.

## 🚀 Features

- **Advanced Comparison Engine:** Word-level diffing with visual highlighting for additions, deletions, and modifications.
- **Multi-Format Support:** Seamlessly process PDF, DOCX, and TXT files with layout preservation.
- **AI-Powered Analysis:** Leverages Gemini 3.0 Flash to explain complex semantic deviations and provide context-aware insights.
- **Interactive Workspace:** 
  - Dual-pane side-by-side viewer.
  - Smooth scroll-to-deviation synchronization.
  - Flash-highlighting for active changes.
- **Full Document Lifecycle:**
  - **Project Management:** Track multiple comparison projects with dedicated templates.
  - **Review Workflow:** Dedicated "Check" tab for approving/rejecting changes with a full audit trail.
  - **Version Control:** Manage document revisions and history.
  - **Export Hub:** Generate professional reports in PDF, Word, or HTML formats.

## 🛠️ Technology Stack

- **Frontend:** React + TypeScript
- **Bundler:** Vite
- **Styling:** Tailwind CSS (v4)
- **AI Logic:** Google Generative AI (Gemini)
- **File Parsing:** PDF.js, Mammoth (for DOCX)
- **Icons:** Lucide React

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd docudiff
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

## 🛡️ Security

- **Privacy First:** All document processing occurs locally or via secure API calls.
- **Secret Management:** Sensitive keys are managed via `.env` and excluded from version control.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
