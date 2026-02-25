// ChatGPT Conversation Exporter
// Paste this into the Chrome DevTools Console (F12) on a ChatGPT conversation page.
// It extracts all user/agent turns and downloads as a timestamped markdown file.
//
// Bookmarklet version (minified) is at the bottom of this file in a comment.

(async () => {
  const lines = [];
  lines.push("agent: ChatGPT 5.2 Thinking");
  lines.push("");

  // Find all conversation turn containers
  const turns = document.querySelectorAll("[data-testid^='conversation-turn-']");

  if (!turns.length) {
    alert("No conversation turns found. Make sure you're on a ChatGPT conversation page.");
    return;
  }

  for (const turn of turns) {
    // Determine role from the data-message-author-role attribute
    const userMsg = turn.querySelector("[data-message-author-role='user']");
    const assistantMsg = turn.querySelector("[data-message-author-role='assistant']");

    let role = null;
    let contentEl = null;

    if (userMsg) {
      role = "user";
      contentEl = userMsg;
    } else if (assistantMsg) {
      role = "agent";
      contentEl = assistantMsg;
    } else {
      continue;
    }

    // Try to get content via the copy button's clipboard mechanism
    const copyBtn = turn.querySelector('[data-testid="copy-turn-action-button"]');
    let text = "";

    if (copyBtn) {
      try {
        // Save current clipboard contents
        const prevClip = await navigator.clipboard.readText().catch(() => "");

        // Click the copy button to populate clipboard
        copyBtn.click();

        // Small delay for clipboard to populate
        await new Promise((r) => setTimeout(r, 150));

        text = await navigator.clipboard.readText();

        // Restore previous clipboard if possible
        if (prevClip) {
          await navigator.clipboard.writeText(prevClip).catch(() => {});
        }
      } catch (e) {
        // Clipboard API failed, fall back to DOM extraction
        text = "";
      }
    }

    // Fallback: extract text directly from the DOM
    if (!text) {
      // For user messages, grab the text content of the user message div
      if (role === "user") {
        const whitespacePre = contentEl.querySelector(".whitespace-pre-wrap");
        text = whitespacePre
          ? whitespacePre.innerText
          : contentEl.innerText;
      } else {
        // For assistant messages, grab the markdown-rendered content
        const markdown = contentEl.querySelector(".markdown");
        if (markdown) {
          text = extractMarkdownFromDom(markdown);
        } else {
          text = contentEl.innerText;
        }
      }
    }

    lines.push(`# ${role}`);
    lines.push("");
    lines.push(text.trim());
    lines.push("");
  }

  // Build timestamp for filename: ChatGPT-YYYYMMDD-HHMMSS.md
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");

  const filename = `ChatGPT-${ts}.md`;
  const content = lines.join("\n");

  // Trigger file download
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`Exported ${turns.length} turns to ${filename}`);

  // Helper: convert assistant rendered HTML back to reasonable markdown
  function extractMarkdownFromDom(el) {
    let md = "";
    for (const node of el.childNodes) {
      md += nodeToMarkdown(node);
    }
    return md;
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();

    // Code blocks (pre > code)
    if (tag === "pre") {
      const code = node.querySelector("code");
      if (code) {
        // Try to detect language from class e.g. "language-python"
        const langClass = [...(code.classList || [])].find((c) =>
          c.startsWith("language-")
        );
        const lang = langClass ? langClass.replace("language-", "") : "";
        // Use innerText to get the code without HTML tags but with newlines
        return `\n\`\`\`${lang}\n${code.innerText.trimEnd()}\n\`\`\`\n`;
      }
      return `\n\`\`\`\n${node.innerText.trimEnd()}\n\`\`\`\n`;
    }

    // Inline code
    if (tag === "code") {
      return "`" + node.textContent + "`";
    }

    // Headings
    const headingMatch = tag.match(/^h([1-6])$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1]);
      // Bump heading levels down by 1 so they don't clash with our # user / # agent
      const prefix = "#".repeat(Math.min(level + 1, 6));
      return `\n${prefix} ${node.textContent.trim()}\n`;
    }

    // Paragraphs
    if (tag === "p") {
      let inner = "";
      for (const child of node.childNodes) inner += nodeToMarkdown(child);
      return `\n${inner.trim()}\n`;
    }

    // Bold
    if (tag === "strong" || tag === "b") {
      let inner = "";
      for (const child of node.childNodes) inner += nodeToMarkdown(child);
      return `**${inner}**`;
    }

    // Italic
    if (tag === "em" || tag === "i") {
      let inner = "";
      for (const child of node.childNodes) inner += nodeToMarkdown(child);
      return `*${inner}*`;
    }

    // Links
    if (tag === "a") {
      let inner = "";
      for (const child of node.childNodes) inner += nodeToMarkdown(child);
      const href = node.getAttribute("href") || "";
      return `[${inner}](${href})`;
    }

    // Lists
    if (tag === "ul" || tag === "ol") {
      let items = "";
      let idx = 1;
      for (const li of node.children) {
        if (li.tagName.toLowerCase() === "li") {
          let inner = "";
          for (const child of li.childNodes) inner += nodeToMarkdown(child);
          const bullet = tag === "ol" ? `${idx++}.` : "-";
          items += `${bullet} ${inner.trim()}\n`;
        }
      }
      return `\n${items}`;
    }

    // Blockquote
    if (tag === "blockquote") {
      let inner = "";
      for (const child of node.childNodes) inner += nodeToMarkdown(child);
      return (
        "\n" +
        inner
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") +
        "\n"
      );
    }

    // Table
    if (tag === "table") {
      return "\n" + tableToMarkdown(node) + "\n";
    }

    // Line breaks
    if (tag === "br") return "\n";

    // Horizontal rule
    if (tag === "hr") return "\n---\n";

    // Default: recurse into children
    let result = "";
    for (const child of node.childNodes) result += nodeToMarkdown(child);
    return result;
  }

  function tableToMarkdown(table) {
    const rows = [];
    for (const tr of table.querySelectorAll("tr")) {
      const cells = [];
      for (const cell of tr.querySelectorAll("th, td")) {
        cells.push(cell.textContent.trim());
      }
      rows.push(cells);
    }
    if (!rows.length) return "";
    const colCount = Math.max(...rows.map((r) => r.length));
    const lines = [];
    rows.forEach((row, i) => {
      while (row.length < colCount) row.push("");
      lines.push("| " + row.join(" | ") + " |");
      if (i === 0) {
        lines.push("| " + row.map(() => "---").join(" | ") + " |");
      }
    });
    return lines.join("\n");
  }
})();

// ============================================================
// BOOKMARKLET VERSION
// Create a bookmark with the following as the URL:
//
// javascript:void((async()=>{const l=["agent: ChatGPT 5.2 Thinking",""];const turns=document.querySelectorAll("[data-testid^='conversation-turn-']");if(!turns.length){alert("No conversation turns found.");return}function n2m(n){if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return"";const t=n.tagName.toLowerCase();if(t==="pre"){const c=n.querySelector("code");const lg=[...(c?.classList||[])].find(x=>x.startsWith("language-"));return"\n```"+(lg?lg.replace("language-",""):"")+"\n"+(c||n).innerText.trimEnd()+"\n```\n"}if(t==="code")return"`"+n.textContent+"`";if(/^h[1-6]$/.test(t))return"\n"+"#".repeat(Math.min(+t[1]+1,6))+" "+n.textContent.trim()+"\n";if(t==="p"){let s="";for(const c of n.childNodes)s+=n2m(c);return"\n"+s.trim()+"\n"}if(t==="strong"||t==="b"){let s="";for(const c of n.childNodes)s+=n2m(c);return"**"+s+"**"}if(t==="em"||t==="i"){let s="";for(const c of n.childNodes)s+=n2m(c);return"*"+s+"*"}if(t==="a"){let s="";for(const c of n.childNodes)s+=n2m(c);return"["+s+"]("+((n.getAttribute("href"))||"")+")"}if(t==="ul"||t==="ol"){let s="",i=1;for(const li of n.children){if(li.tagName.toLowerCase()==="li"){let x="";for(const c of li.childNodes)x+=n2m(c);s+=(t==="ol"?i+++".":"-")+" "+x.trim()+"\n"}}return"\n"+s}if(t==="br")return"\n";if(t==="hr")return"\n---\n";let r="";for(const c of n.childNodes)r+=n2m(c);return r}for(const turn of turns){const u=turn.querySelector("[data-message-author-role='user']");const a=turn.querySelector("[data-message-author-role='assistant']");let role,el;if(u){role="user";el=u}else if(a){role="agent";el=a}else continue;let txt="";const cb=turn.querySelector('[data-testid="copy-turn-action-button"]');if(cb){try{cb.click();await new Promise(r=>setTimeout(r,150));txt=await navigator.clipboard.readText()}catch(e){}}if(!txt){if(role==="user"){const w=el.querySelector(".whitespace-pre-wrap");txt=w?w.innerText:el.innerText}else{const md=el.querySelector(".markdown");if(md){let s="";for(const c of md.childNodes)s+=n2m(c);txt=s}else txt=el.innerText}}l.push("# "+role,"",txt.trim(),"")}const now=new Date();const ts=now.getFullYear()+String(now.getMonth()+1).padStart(2,"0")+String(now.getDate()).padStart(2,"0")+"-"+String(now.getHours()).padStart(2,"0")+String(now.getMinutes()).padStart(2,"0")+String(now.getSeconds()).padStart(2,"0");const fn="ChatGPT-"+ts+".md";const blob=new Blob([l.join("\n")],{type:"text/markdown"});const url=URL.createObjectURL(blob);const anc=document.createElement("a");anc.href=url;anc.download=fn;document.body.appendChild(anc);anc.click();document.body.removeChild(anc);URL.revokeObjectURL(url);console.log("Exported "+turns.length+" turns to "+fn)})())
// ============================================================
