import { handleCors } from './_db.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';
const CLAUDE_SONNET = 'claude-sonnet-4-5-20250929';
const OPENAI_GPT4O_MINI = 'gpt-4o-mini';
const OPENAI_GPT4O = 'gpt-4o';

async function callAnthropic(systemPrompt, userPrompt, model = CLAUDE_SONNET, maxTokens = 5000) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }], system: systemPrompt }),
    });
    const body = await r.json();
    if (!r.ok) return { ok: false, error: `Anthropic ${r.status}: ${JSON.stringify(body)}`, provider: 'anthropic' };
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { ok: true, text, model, provider: 'anthropic', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: e.message, provider: 'anthropic' };
  }
}

async function callOpenAI(systemPrompt, userPrompt, model = OPENAI_GPT4O, maxTokens = 5000) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    });
    const body = await r.json();
    if (!r.ok) return { ok: false, error: `OpenAI ${r.status}: ${JSON.stringify(body)}`, provider: 'openai' };
    return { ok: true, text: body.choices[0].message.content, model, provider: 'openai', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: e.message, provider: 'openai' };
  }
}

async function callOpenAIWebSearch(systemPrompt, userPrompt, model = 'gpt-4o-search-preview', maxTokens = 5000) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, web_search_options: { search_context_size: 'medium' }, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    });
    const body = await r.json();
    if (!r.ok) return { ok: false, error: `OpenAI Search ${r.status}: ${JSON.stringify(body)}`, provider: 'openai_search' };
    return { ok: true, text: body.choices[0].message.content, model, provider: 'openai_search', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: e.message, provider: 'openai_search' };
  }
}

async function callAnthropicWithSearch(systemPrompt, userPrompt, model = CLAUDE_HAIKU, maxTokens = 4000) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], messages: [{ role: 'user', content: userPrompt }], system: systemPrompt }),
    });
    const body = await r.json();
    if (!r.ok) return { ok: false, error: `Anthropic Search ${r.status}: ${JSON.stringify(body)}`, provider: 'anthropic_search' };
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { ok: true, text, model, provider: 'anthropic_search', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: e.message, provider: 'anthropic_search' };
  }
}

async function callAI(systemPrompt, userPrompt, modelPref = 'sonnet', maxTokens = 5000, useSearch = false) {
  if (useSearch) {
    const result = await callOpenAIWebSearch(systemPrompt, userPrompt, undefined, maxTokens);
    if (result.ok) return result;
    return callOpenAI(systemPrompt, userPrompt, OPENAI_GPT4O, maxTokens);
  }
  const claudeModel = modelPref === 'sonnet' ? CLAUDE_SONNET : CLAUDE_HAIKU;
  const openaiModel = ['sonnet', 'gpt4o'].includes(modelPref) ? OPENAI_GPT4O : OPENAI_GPT4O_MINI;
  const result = await callAnthropic(systemPrompt, userPrompt, claudeModel, maxTokens);
  if (result.ok) return result;
  return callOpenAI(systemPrompt, userPrompt, openaiModel, maxTokens);
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const body = req.body || {};
  const action = body.action || '';

  try {
    if (action === 'scan_website') {
      const url = (body.url || '').trim();
      if (!url) return res.status(400).json({ error: 'URL required' });
      const systemPrompt = 'Search the web for the company at the given URL. Then return ONLY valid JSON with the extracted data. No markdown, no backticks, no commentary. If you cannot determine a field, use empty string "". Keep all values on a single line.';
      const userPrompt = `Search for this company: ${url}\n\nFind what they do, what they sell, target market, value props, industry, company size, and differentiators.\n\nAfter searching, return ONLY this JSON structure with fields filled from your research:\n\n{"company":{"name":"","website":"${url}","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;
      const result = await callAI(systemPrompt, userPrompt, 'haiku', 3000, true);
      return res.json(result);
    }

    if (action === 'extract_notes') {
      const notesText = (body.notes || '').trim();
      const source = body.source || 'raw';
      if (!notesText) return res.status(400).json({ error: 'Notes text required' });
      const systemPrompt = `STRICT JSON OUTPUT MODE. Return ONLY valid JSON. No markdown. No backticks. No commentary. No trailing commas. Escape all quotes inside strings. No newlines inside string values.\n\nYou are extracting client intake data from meeting notes (likely from Circleback, Granola, Fathom, Otter, or similar AI notetaker).\n\nThese notes contain a conversation about a client's business, offer, target market, pain points, and goals. Extract as much structured data as possible.\n\nFor fields you cannot determine, use empty string "". Do not fabricate. Only extract what is explicitly mentioned or clearly implied in the notes.`;
      const userPrompt = `Extract intake form data from these meeting notes.\n\nSOURCE: ${source}\n\nNOTES:\n${notesText}\n\nReturn ONLY this JSON. Fill every field you can extract. Empty string for unknowns.\n\n{"company":{"name":"","website":"","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;
      const result = await callAI(systemPrompt, userPrompt, 'haiku', 3000);
      return res.json(result);
    }

    if (action === 'strategy_part_a') {
      const companyName = body.company_name || '';
      const intakeBlock = body.intake_block || '';
      const model = body.model || 'sonnet';
      if (!intakeBlock) return res.status(400).json({ error: 'intake_block required' });
      const systemPrompt = 'Output ONLY valid JSON. No markdown, no backticks, no commentary. Single-line string values. Escape quotes with backslash.\nRules: VP+ seniority default. Observation > Offer tone. Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing"';
      const userPrompt = `Strategy Part A for: ${companyName}\n\n${intakeBlock}\n\nReturn JSON:\n{"client_name":"","offer_summary":"","icp_summary":"","icp_refinement":{"primary_segments":[{"segment":"","description":"","fit_score":85},{"segment":"","description":"","fit_score":75}],"secondary_segments":[{"segment":"","description":"","fit_score":60}],"narrowing_recommendations":["",""],"red_flags":["",""]},"decision_maker_targeting":{"seniority_policy":"VP_PLUS_DEFAULT","primary_titles":[{"title":"","rationale":""},{"title":"","rationale":""}],"secondary_titles":[{"title":"","rationale":""}],"avoid_titles":["",""],"buying_committee":{"who_cares":"","who_signs":"","who_influences":"","who_blocks":""}},"channel_strategy":{"primary_channel":"","channel_breakdown":[{"channel":"","usage":"","daily_volume":"","notes":""}],"pacing":{"ramp_week_1":"","steady_state":"","multi_sender":""},"warm_vs_cold":""},"messaging_angles":{"angles":[{"name":"","description":"","when_to_use":"","example_hook":"","strength":85},{"name":"","description":"","when_to_use":"","example_hook":"","strength":80}],"lead_with":{"insight":"","curiosity":"","credibility":""},"never_say":["",""]},"value_prop_framing":{"first_touch_simplification":"","outcome_emphasis":{"primary":"","secondary":"","tertiary":""},"proof_point_strategy":{"hint_in_outreach":["",""],"save_for_calls":["",""]}},"meeting_booking":{"cta_style":{"recommended":"","description":"","examples":["",""]},"calendar_link_timing":"","friction_reduction":["",""],"no_show_prevention":["",""]}}`;
      const result = await callAI(systemPrompt, userPrompt, model, 4000);
      return res.json(result);
    }

    if (action === 'strategy_part_b') {
      const companyName = body.company_name || '';
      const intakeBlock = body.intake_block || '';
      const model = body.model || 'sonnet';
      if (!intakeBlock) return res.status(400).json({ error: 'intake_block required' });
      const systemPrompt = 'Output ONLY valid JSON. No markdown, no backticks, no commentary. Single-line string values. Escape quotes with backslash.\nRules: VP+ seniority default. Observation > Offer tone. Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing"';
      const userPrompt = `Strategy Part B for: ${companyName}\n\n${intakeBlock}\n\nReturn JSON:\n{"sales_nav":{"recommended_filters":{"geography":[""],"company_size":{"min":50,"max":500},"industries":[""],"seniority":[""],"exclude_industries":[""]},"title_patterns":{"high_performers":["",""],"boolean_string":""},"profile_red_flags":["",""]},"campaign_risks":{"likely_objections":[{"objection":"","response_angle":""},{"objection":"","response_angle":""}],"success_signals":["",""],"failure_signals":["",""],"week_1_2_adjustments":["",""]},"targeting":{"seniority_policy":"VP_PLUS_DEFAULT","title_clusters":[{"cluster":"","titles":["",""],"notes":""},{"cluster":"","titles":[""],"notes":""}],"filters":{"company_size_min":50,"company_size_max":500,"industries_include":[""],"exclude":[""]}},"positioning":{"primary_angle":"","philosophy":"","avoid":["",""],"hooks":["",""]},"conversation_flow":{"connect_note":"","message_1":{"label":"","text":"","quality_score":85,"quality_notes":""},"message_2":{"label":"","text":"","quality_score":85,"quality_notes":""},"message_3":{"label":"","text":"","quality_score":85,"quality_notes":""},"cta_rules":"","tone_rules":"","strict_avoid":["",""]},"follow_up":{"cadence":"","philosophy":"","themes":[{"touch":1,"theme":"","angle":""},{"touch":2,"theme":"","angle":""},{"touch":3,"theme":"","angle":""}]},"ridge_execution_notes":{"personalization":"","message_philosophy":"","quality_benchmark":"","risks":["",""],"next_steps":["","",""]}}`;
      const result = await callAI(systemPrompt, userPrompt, model, 4000);
      return res.json(result);
    }

    if (action === 'summarize_section') {
      const sectionData = body.section_data || '';
      const clientName = body.client_name || '';
      const sectionName = body.section_name || '';
      if (!sectionData) return res.status(400).json({ error: 'section_data required' });
      const systemPrompt = "You write concise, professional summaries for sales teams. Write in plain language, no markdown, no bullet points, no headers. Write as 2-4 short paragraphs that someone can copy-paste into a Slack message or email to a client/prospect. Reference the client by name. Be specific — use actual data from the section. Keep it under 200 words.";
      const userPrompt = `Summarize this ${sectionName} section for ${clientName}:\n\n${sectionData}`;
      const result = await callAI(systemPrompt, userPrompt, 'haiku', 1000);
      return res.json(result);
    }

    if (action === 'health') {
      return res.json({ ok: true, providers: ['anthropic', 'openai'], models: { fast: CLAUDE_HAIKU, strategy: CLAUDE_SONNET, fallback_fast: OPENAI_GPT4O_MINI, fallback_strategy: OPENAI_GPT4O, web_search: 'gpt-4o-search-preview' } });
    }

    if (action === 'scan_intelligence') {
      const query = body.query || '';
      const context = body.context || '';
      if (!query) return res.status(400).json({ error: 'query required' });
      const systemPrompt = `You are a B2B sales intelligence scanner. Search the web for the given query. Find recent news, announcements, social posts, and events that could be relevant for outbound sales prospecting.\n\nAfter searching, return ONLY a valid JSON array of signals. No markdown, no backticks, no explanation. Each signal object:\n{"headline":"Short headline","source":"Source name","url":"URL if available","date":"ISO date or relative","signal_type":"funding|hiring|leadership_change|earnings|competitor|regulatory|product_launch|market_trend|expansion|layoff|acquisition|partnership|pain_signal|tech_adoption|social_post","summary":"1-2 sentence explanation","companies_mentioned":["Company A"],"urgency":"immediate|this_week|monitor","relevance_score":85}\n\nReturn 3-5 of the most relevant and recent signals.`;
      const userPrompt = `Search for: ${query}\n\n${context}`;
      let result = await callAnthropicWithSearch(systemPrompt, userPrompt, CLAUDE_HAIKU, 4000);
      if (!result.ok) result = await callOpenAIWebSearch(systemPrompt, userPrompt, undefined, 4000);
      return res.json(result);
    }

    if (action === 'draft_outreach') {
      const signalData = body.signal || '';
      const context = body.context || '';
      if (!signalData) return res.status(400).json({ error: 'signal data required' });
      const systemPrompt = `You write concise B2B outreach messages for LinkedIn and email. Rules:\n- Observation > Offer tone. Lead with what you noticed, not what you sell.\n- Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing"\n- Reference the specific signal/news naturally\n- Keep LinkedIn connection notes under 300 characters, messages under 1000\n- Be human, direct, and specific\n- No emojis in professional outreach\n\nReturn ONLY valid JSON:\n{"connection_note":"","linkedin_message":"","email_subject":"","email_body":"","suggested_target_title":"","timing_note":""}`;
      const userPrompt = `Generate outreach based on this signal:\n\n${signalData}\n\nClient/strategy context:\n${context}`;
      const result = await callAI(systemPrompt, userPrompt, 'haiku', 2000);
      return res.json(result);
    }

    if (action === 'market_pulse') {
      const systemPrompt = 'Search for current US stock market data. Return ONLY JSON, no markdown, no backticks.';
      const userPrompt = `Get today's US market data. Return ONLY this JSON:\n{"sp500":{"price":"","change_pct":""},"nasdaq":{"price":"","change_pct":""},"ten_year_yield":"","vix":"","updated":""}\nIf markets are closed, return last closing data.`;
      let result = await callAnthropicWithSearch(systemPrompt, userPrompt, CLAUDE_HAIKU, 500);
      if (!result.ok) result = await callOpenAIWebSearch(systemPrompt, userPrompt, undefined, 500);
      return res.json(result);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('AI error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
