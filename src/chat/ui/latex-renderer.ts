export interface LatexRendererConfig {
  fontSize?: number;
  color?: string;
  displayMode?: boolean;
  onRender?: (html: string) => void;
}

export interface SymbolCategory {
  name: string;
  symbols: SymbolEntry[];
}

export interface SymbolEntry {
  label: string;
  latex: string;
  description: string;
}

const SYMBOL_CATEGORIES: SymbolCategory[] = [
  {
    name: 'Greek Letters',
    symbols: [
      { label: 'α', latex: '\\alpha', description: 'alpha' },
      { label: 'β', latex: '\\beta', description: 'beta' },
      { label: 'γ', latex: '\\gamma', description: 'gamma' },
      { label: 'δ', latex: '\\delta', description: 'delta' },
      { label: 'ε', latex: '\\epsilon', description: 'epsilon' },
      { label: 'ζ', latex: '\\zeta', description: 'zeta' },
      { label: 'η', latex: '\\eta', description: 'eta' },
      { label: 'θ', latex: '\\theta', description: 'theta' },
      { label: 'ι', latex: '\\iota', description: 'iota' },
      { label: 'κ', latex: '\\kappa', description: 'kappa' },
      { label: 'λ', latex: '\\lambda', description: 'lambda' },
      { label: 'μ', latex: '\\mu', description: 'mu' },
      { label: 'ν', latex: '\\nu', description: 'nu' },
      { label: 'ξ', latex: '\\xi', description: 'xi' },
      { label: 'π', latex: '\\pi', description: 'pi' },
      { label: 'ρ', latex: '\\rho', description: 'rho' },
      { label: 'σ', latex: '\\sigma', description: 'sigma' },
      { label: 'τ', latex: '\\tau', description: 'tau' },
      { label: 'φ', latex: '\\phi', description: 'phi' },
      { label: 'χ', latex: '\\chi', description: 'chi' },
      { label: 'ψ', latex: '\\psi', description: 'psi' },
      { label: 'ω', latex: '\\omega', description: 'omega' },
      { label: 'Γ', latex: '\\Gamma', description: 'Gamma' },
      { label: 'Δ', latex: '\\Delta', description: 'Delta' },
      { label: 'Θ', latex: '\\Theta', description: 'Theta' },
      { label: 'Λ', latex: '\\Lambda', description: 'Lambda' },
      { label: 'Ξ', latex: '\\Xi', description: 'Xi' },
      { label: 'Π', latex: '\\Pi', description: 'Pi' },
      { label: 'Σ', latex: '\\Sigma', description: 'Sigma' },
      { label: 'Φ', latex: '\\Phi', description: 'Phi' },
      { label: 'Ψ', latex: '\\Psi', description: 'Psi' },
      { label: 'Ω', latex: '\\Omega', description: 'Omega' },
    ],
  },
  {
    name: 'Operators',
    symbols: [
      { label: '±', latex: '\\pm', description: 'plus-minus' },
      { label: '∓', latex: '\\mp', description: 'minus-plus' },
      { label: '×', latex: '\\times', description: 'times' },
      { label: '÷', latex: '\\div', description: 'division' },
      { label: '·', latex: '\\cdot', description: 'centered dot' },
      { label: '∘', latex: '\\circ', description: 'circle' },
      { label: '⊕', latex: '\\oplus', description: 'oplus' },
      { label: '⊗', latex: '\\otimes', description: 'otimes' },
      { label: '∑', latex: '\\sum', description: 'summation' },
      { label: '∏', latex: '\\prod', description: 'product' },
      { label: '∐', latex: '\\coprod', description: 'coproduct' },
      { label: '∫', latex: '\\int', description: 'integral' },
      { label: '∬', latex: '\\iint', description: 'double integral' },
      { label: '∮', latex: '\\oint', description: 'contour integral' },
    ],
  },
  {
    name: 'Relations',
    symbols: [
      { label: '≤', latex: '\\leq', description: 'less than or equal' },
      { label: '≥', latex: '\\geq', description: 'greater than or equal' },
      { label: '≠', latex: '\\neq', description: 'not equal' },
      { label: '≈', latex: '\\approx', description: 'approximately equal' },
      { label: '≡', latex: '\\equiv', description: 'identically equal' },
      { label: '∝', latex: '\\propto', description: 'proportional to' },
      { label: '∈', latex: '\\in', description: 'element of' },
      { label: '∉', latex: '\\notin', description: 'not element of' },
      { label: '⊂', latex: '\\subset', description: 'subset' },
      { label: '⊃', latex: '\\supset', description: 'superset' },
      { label: '⊆', latex: '\\subseteq', description: 'subset or equal' },
      { label: '⊇', latex: '\\supseteq', description: 'superset or equal' },
      { label: '∪', latex: '\\cup', description: 'union' },
      { label: '∩', latex: '\\cap', description: 'intersection' },
      { label: '∧', latex: '\\land', description: 'logical and' },
      { label: '∨', latex: '\\lor', description: 'logical or' },
      { label: '¬', latex: '\\neg', description: 'logical not' },
      { label: '→', latex: '\\rightarrow', description: 'right arrow' },
      { label: '←', latex: '\\leftarrow', description: 'left arrow' },
      { label: '↔', latex: '\\leftrightarrow', description: 'left-right arrow' },
      { label: '⇒', latex: '\\Rightarrow', description: 'implies' },
      { label: '⇐', latex: '\\Leftarrow', description: 'implied by' },
      { label: '⇔', latex: '\\Leftrightarrow', description: 'if and only if' },
    ],
  },
  {
    name: 'Functions',
    symbols: [
      { label: 'sin', latex: '\\sin', description: 'sine' },
      { label: 'cos', latex: '\\cos', description: 'cosine' },
      { label: 'tan', latex: '\\tan', description: 'tangent' },
      { label: 'cot', latex: '\\cot', description: 'cotangent' },
      { label: 'sec', latex: '\\sec', description: 'secant' },
      { label: 'csc', latex: '\\csc', description: 'cosecant' },
      { label: 'log', latex: '\\log', description: 'logarithm' },
      { label: 'ln', latex: '\\ln', description: 'natural log' },
      { label: 'lim', latex: '\\lim', description: 'limit' },
      { label: 'max', latex: '\\max', description: 'maximum' },
      { label: 'min', latex: '\\min', description: 'minimum' },
      { label: 'sup', latex: '\\sup', description: 'supremum' },
      { label: 'inf', latex: '\\inf', description: 'infimum' },
      { label: 'det', latex: '\\det', description: 'determinant' },
    ],
  },
  {
    name: 'Accents & Decorations',
    symbols: [
      { label: 'â', latex: '\\hat{a}', description: 'hat' },
      { label: 'ā', latex: '\\bar{a}', description: 'bar' },
      { label: 'a⃗', latex: '\\vec{a}', description: 'vector' },
      { label: 'a̅', latex: '\\overline{a}', description: 'overline' },
      { label: 'a_', latex: '\\underline{a}', description: 'underline' },
      { label: 'a~', latex: '\\tilde{a}', description: 'tilde' },
      { label: 'ȧ', latex: '\\dot{a}', description: 'dot' },
      { label: 'ä', latex: '\\ddot{a}', description: 'double dot' },
      { label: 'ȧ⃗', latex: '\\ddot{a}', description: 'double dot' },
    ],
  },
  {
    name: 'Brackets & Delimiters',
    symbols: [
      { label: '⌈x⌉', latex: '\\lceil x \\rceil', description: 'ceiling' },
      { label: '⌊x⌋', latex: '\\lfloor x \\rfloor', description: 'floor' },
      { label: '|x|', latex: '\\lvert x \\rvert', description: 'absolute value' },
      { label: '‖x‖', latex: '\\lVert x \\rVert', description: 'norm' },
      { label: '{x}', latex: '\\lbrace x \\rbrace', description: 'braces' },
    ],
  },
];

const LATEX_TEMPLATES: Array<{ name: string; latex: string }> = [
  { name: 'Fraction', latex: '\\frac{a}{b}' },
  { name: 'Square Root', latex: '\\sqrt{x}' },
  { name: 'Nth Root', latex: '\\sqrt[n]{x}' },
  { name: 'Superscript', latex: 'x^{n}' },
  { name: 'Subscript', latex: 'x_{i}' },
  { name: 'Sum', latex: '\\sum_{i=1}^{n} x_i' },
  { name: 'Product', latex: '\\prod_{i=1}^{n} x_i' },
  { name: 'Integral', latex: '\\int_{a}^{b} f(x) \\, dx' },
  { name: 'Double Integral', latex: '\\iint_{D} f(x,y) \\, dA' },
  { name: 'Limit', latex: '\\lim_{x \\to \\infty} f(x)' },
  { name: 'Derivative', latex: '\\frac{df}{dx}' },
  { name: 'Partial Derivative', latex: '\\frac{\\partial f}{\\partial x}' },
  { name: 'Matrix 2x2', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { name: 'Matrix 3x3', latex: '\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}' },
  { name: 'Determinant', latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}' },
  { name: 'Cases', latex: '\\begin{cases} x & \\text{if } x > 0 \\\\ -x & \\text{otherwise} \\end{cases}' },
  { name: 'Binomial', latex: '\\binom{n}{k}' },
  { name: 'Vector', latex: '\\vec{v} = \\begin{pmatrix} v_1 \\\\ v_2 \\\\ v_3 \\end{pmatrix}' },
];

export class LatexRenderer {
  private container: HTMLElement | null = null;
  private previewEl: HTMLDivElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private symbolPaletteEl: HTMLDivElement | null = null;
  private config: LatexRendererConfig;
  private currentLatex: string = '';
  private renderTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: LatexRendererConfig = {}) {
    this.config = {
      fontSize: 18,
      color: '#000000',
      displayMode: true,
      ...config,
    };
  }

  render(latex: string, display: boolean = true): string {
    this.currentLatex = latex;

    if (!this.validate(latex).valid) {
      return `<span class="latex-error" title="Invalid LaTeX">⚠ ${this.escapeHtml(latex)}</span>`;
    }

    if (display) {
      return this.renderBlock(latex);
    }
    return this.renderInline(latex);
  }

  renderInline(latex: string): string {
    const html = this.latexToHtml(latex);
    return `<span class="latex-inline" style="font-size: ${this.config.fontSize}px; color: ${this.config.color};">${html}</span>`;
  }

  renderBlock(latex: string): string {
    const html = this.latexToHtml(latex);
    return `<div class="latex-block" style="font-size: ${this.config.fontSize}px; color: ${this.config.color}; text-align: center; padding: 8px 0;">${html}</div>`;
  }

  validate(latex: string): { valid: boolean; error?: string } {
    const trimmed = latex.trim();
    if (!trimmed) {
      return { valid: false, error: 'Empty LaTeX expression' };
    }

    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      return { valid: false, error: 'Mismatched braces { }' };
    }

    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return { valid: false, error: 'Mismatched brackets [ ]' };
    }

    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return { valid: false, error: 'Mismatched parentheses ( )' };
    }

    const envMatches = trimmed.match(/\\begin{(\w+)}/g);
    const endMatches = trimmed.match(/\\end{(\w+)}/g);

    if (envMatches && endMatches) {
      if (envMatches.length !== endMatches.length) {
        return { valid: false, error: 'Mismatched \\begin and \\end environments' };
      }
    }

    return { valid: true };
  }

  getCommonSymbols(): SymbolCategory[] {
    return [...SYMBOL_CATEGORIES];
  }

  getTemplates(): Array<{ name: string; latex: string }> {
    return [...LATEX_TEMPLATES];
  }

  private latexToHtml(latex: string): string {
    let result = this.escapeHtml(latex);

    result = result.replace(
      /\\frac\{([^}]+)\}\{([^}]+)\}/g,
      '<span class="latex-frac"><span class="latex-frac-num">$1</span><span class="latex-frac-den">$2</span></span>'
    );

    result = result.replace(
      /\\sqrt\{([^}]+)\}/g,
      '<span class="latex-sqrt">√<span class="latex-sqrt-content">$1</span></span>'
    );

    result = result.replace(
      /\\sqrt\[(\d+)\]\{([^}]+)\}/g,
      '<span class="latex-sqrt"><sup class="latex-sqrt-n">$1</sup>√<span class="latex-sqrt-content">$2</span></span>'
    );

    result = result.replace(/\\sum/g, '∑');
    result = result.replace(/\\prod/g, '∏');
    result = result.replace(/\\coprod/g, '∐');
    result = result.replace(/\\int/g, '∫');
    result = result.replace(/\\iint/g, '∬');
    result = result.replace(/\\oint/g, '∮');

    result = result.replace(/\\alpha/g, 'α');
    result = result.replace(/\\beta/g, 'β');
    result = result.replace(/\\gamma/g, 'γ');
    result = result.replace(/\\delta/g, 'δ');
    result = result.replace(/\\epsilon/g, 'ε');
    result = result.replace(/\\zeta/g, 'ζ');
    result = result.replace(/\\eta/g, 'η');
    result = result.replace(/\\theta/g, 'θ');
    result = result.replace(/\\iota/g, 'ι');
    result = result.replace(/\\kappa/g, 'κ');
    result = result.replace(/\\lambda/g, 'λ');
    result = result.replace(/\\mu/g, 'μ');
    result = result.replace(/\\nu/g, 'ν');
    result = result.replace(/\\xi/g, 'ξ');
    result = result.replace(/\\pi/g, 'π');
    result = result.replace(/\\rho/g, 'ρ');
    result = result.replace(/\\sigma/g, 'σ');
    result = result.replace(/\\tau/g, 'τ');
    result = result.replace(/\\phi/g, 'φ');
    result = result.replace(/\\chi/g, 'χ');
    result = result.replace(/\\psi/g, 'ψ');
    result = result.replace(/\\omega/g, 'ω');

    result = result.replace(/\\Gamma/g, 'Γ');
    result = result.replace(/\\Delta/g, 'Δ');
    result = result.replace(/\\Theta/g, 'Θ');
    result = result.replace(/\\Lambda/g, 'Λ');
    result = result.replace(/\\Xi/g, 'Ξ');
    result = result.replace(/\\Pi/g, 'Π');
    result = result.replace(/\\Sigma/g, 'Σ');
    result = result.replace(/\\Phi/g, 'Φ');
    result = result.replace(/\\Psi/g, 'Ψ');
    result = result.replace(/\\Omega/g, 'Ω');

    result = result.replace(/\\leq/g, '≤');
    result = result.replace(/\\geq/g, '≥');
    result = result.replace(/\\neq/g, '≠');
    result = result.replace(/\\approx/g, '≈');
    result = result.replace(/\\equiv/g, '≡');
    result = result.replace(/\\propto/g, '∝');
    result = result.replace(/\\in/g, '∈');
    result = result.replace(/\\notin/g, '∉');
    result = result.replace(/\\subset/g, '⊂');
    result = result.replace(/\\supset/g, '⊃');
    result = result.replace(/\\subseteq/g, '⊆');
    result = result.replace(/\\supseteq/g, '⊇');
    result = result.replace(/\\cup/g, '∪');
    result = result.replace(/\\cap/g, '∩');
    result = result.replace(/\\land/g, '∧');
    result = result.replace(/\\lor/g, '∨');
    result = result.replace(/\\neg/g, '¬');
    result = result.replace(/\\rightarrow/g, '→');
    result = result.replace(/\\leftarrow/g, '←');
    result = result.replace(/\\leftrightarrow/g, '↔');
    result = result.replace(/\\Rightarrow/g, '⇒');
    result = result.replace(/\\Leftarrow/g, '⇐');
    result = result.replace(/\\Leftrightarrow/g, '⇔');

    result = result.replace(/\\pm/g, '±');
    result = result.replace(/\\mp/g, '∓');
    result = result.replace(/\\times/g, '×');
    result = result.replace(/\\div/g, '÷');
    result = result.replace(/\\cdot/g, '·');
    result = result.replace(/\\circ/g, '∘');
    result = result.replace(/\\oplus/g, '⊕');
    result = result.replace(/\\otimes/g, '⊗');

    result = result.replace(/\\sin/g, 'sin');
    result = result.replace(/\\cos/g, 'cos');
    result = result.replace(/\\tan/g, 'tan');
    result = result.replace(/\\cot/g, 'cot');
    result = result.replace(/\\sec/g, 'sec');
    result = result.replace(/\\csc/g, 'csc');
    result = result.replace(/\\log/g, 'log');
    result = result.replace(/\\ln/g, 'ln');
    result = result.replace(/\\lim/g, 'lim');
    result = result.replace(/\\max/g, 'max');
    result = result.replace(/\\min/g, 'min');
    result = result.replace(/\\sup/g, 'sup');
    result = result.replace(/\\inf/g, 'inf');
    result = result.replace(/\\det/g, 'det');

    result = result.replace(/\\lceil/g, '⌈');
    result = result.replace(/\\rceil/g, '⌉');
    result = result.replace(/\\lfloor/g, '⌊');
    result = result.replace(/\\rfloor/g, '⌋');
    result = result.replace(/\\lvert/g, '|');
    result = result.replace(/\\rvert/g, '|');
    result = result.replace(/\\lVert/g, '‖');
    result = result.replace(/\\rVert/g, '‖');
    result = result.replace(/\\lbrace/g, '{');
    result = result.replace(/\\rbrace/g, '}');

    result = result.replace(
      /\\hat\{([^}]+)\}/g,
      '<span class="latex-accent" style="text-decoration: overline; position: relative;">$1<span style="position: absolute; top: -0.5em; left: 50%; transform: translateX(-50%);">^</span></span>'
    );

    result = result.replace(/\\bar\{([^}]+)\}/g, '<span style="text-decoration: overline;">$1</span>');
    result = result.replace(/\\underline\{([^}]+)\}/g, '<span style="text-decoration: underline;">$1</span>');
    result = result.replace(
      /\\vec\{([^}]+)\}/g,
      '<span class="latex-vec">$1→</span>'
    );
    result = result.replace(/\\tilde\{([^}]+)\}/g, '<span style="text-decoration: overline; font-style: italic;">$1</span>');
    result = result.replace(/\\dot\{([^}]+)\}/g, '<span class="latex-dot">$1·</span>');
    result = result.replace(/\\ddot\{([^}]+)\}/g, '<span class="latex-dot">$1¨</span>');

    result = result.replace(/\\binom\{(\w+)\}\{(\w+)\}/g, '<span class="latex-binom">(<sup>$1</sup>/<sub>$2</sub>)</span>');

    result = result.replace(
      /\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g,
      (_match, content: string) => {
        const rows = content.split('\\\\').map((r: string) => r.trim());
        const cells = rows.map((r: string) =>
          r.split('&').map((c: string) => `<td class="latex-matrix-cell">${c.trim()}</td>`).join('')
        );
        return `<span class="latex-matrix"><span class="latex-bracket">(</span><table class="latex-matrix-table"><tbody>${cells.map((c: string) => `<tr>${c}</tr>`).join('')}</tbody></table><span class="latex-bracket">)</span></span>`;
      }
    );

    result = result.replace(
      /\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/g,
      (_match, content: string) => {
        const rows = content.split('\\\\').map((r: string) => r.trim());
        const cells = rows.map((r: string) =>
          r.split('&').map((c: string) => `<td class="latex-matrix-cell">${c.trim()}</td>`).join('')
        );
        return `<span class="latex-matrix"><span class="latex-bracket">|</span><table class="latex-matrix-table"><tbody>${cells.map((c: string) => `<tr>${c}</tr>`).join('')}</tbody></table><span class="latex-bracket">|</span></span>`;
      }
    );

    result = result.replace(
      /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
      (_match, content: string) => {
        const lines = content.split('\\\\').map((l: string) => l.trim());
        return `<span class="latex-cases">{ ${lines.map((l: string) => `<div class="latex-cases-line">${l}</div>`).join('')} </span>`;
      }
    );

    result = result.replace(
      /\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}/g,
      (_match, content: string) => {
        const rows = content.split('\\\\').map((r: string) => r.trim());
        const cells = rows.map((r: string) =>
          r.split('&').map((c: string) => `<td class="latex-matrix-cell">${c.trim()}</td>`).join('')
        );
        return `<span class="latex-matrix"><table class="latex-matrix-table"><tbody>${cells.map((c: string) => `<tr>${c}</tr>`).join('')}</tbody></table></span>`;
      }
    );

    result = result.replace(/\\text\{([^}]+)\}/g, '<span class="latex-text">$1</span>');
    result = result.replace(/\\mathrm\{([^}]+)\}/g, '<span class="latex-text" style="font-family: serif;">$1</span>');
    result = result.replace(/\\mathbf\{([^}]+)\}/g, '<span class="latex-text" style="font-weight: bold;">$1</span>');
    result = result.replace(/\\mathit\{([^}]+)\}/g, '<span class="latex-text" style="font-style: italic;">$1</span>');
    result = result.replace(/\\mathcal\{([^}]+)\}/g, '<span class="latex-text" style="font-family: cursive;">$1</span>');

    result = result.replace(/\\left\(/g, '<span class="latex-big-paren">(</span>');
    result = result.replace(/\\right\)/g, '<span class="latex-big-paren">)</span>');
    result = result.replace(/\\left\[/g, '<span class="latex-big-bracket">[</span>');
    result = result.replace(/\\right\]/g, '<span class="latex-big-bracket">]</span>');
    result = result.replace(/\\left\\\{/g, '<span class="latex-big-brace">{</span>');
    result = result.replace(/\\right\\\}/g, '<span class="latex-big-brace">}</span>');
    result = result.replace(/\\left\|/g, '<span class="latex-big-pipe">|</span>');
    result = result.replace(/\\right\|/g, '<span class="latex-big-pipe">|</span>');

    result = result.replace(/\\\\/g, '<br>');
    result = result.replace(/\\,/g, ' ');
    result = result.replace(/\\;/g, '&nbsp;');
    result = result.replace(/\\!/g, '');
    result = result.replace(/\\quad/g, '&emsp;');
    result = result.replace(/\\qquad/g, '&emsp;&emsp;');

    result = result.replace(/_{([^}]+)}/g, '<sub>$1</sub>');
    result = result.replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>');
    result = result.replace(/\^{([^}]+)}/g, '<sup>$1</sup>');
    result = result.replace(/\^([a-zA-Z0-9])/g, '<sup>$1</sup>');

    result = result.replace(/\*/g, '×');

    result = result.replace(/\{/g, '<span class="latex-brace">{</span>');
    result = result.replace(/\}/g, '<span class="latex-brace">}</span>');

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
