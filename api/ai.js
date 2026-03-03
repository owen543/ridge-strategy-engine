// Ridge Strategy Engine — AI Proxy
// Routes AI calls through the server so API keys never touch the browser.
// Supports: Anthropic Claude (primary) and OpenAI (fallback).

const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';
const CLAUDE_SONNET = 'claude-sonnet-4-5-20250929';
const OPENAI_GPT4O_MINI = 'gpt-4o-mini';
const OPENAI_GPT4O = 'gpt-4o';

async function callAnthropic(systemPrompt, userPrompt, model = CLAUDE_SONNET, maxTokens = 5000) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not configured', provider: 'anthropic' };
  }

  const payload = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: payload,
    });

    const body = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: `Anthropic ${response.status}: ${JSON.stringify(body)}`,
        provider: 'anthropic',
      };
    }

    let text = '';
    for (const block of body.content || []) {
      if (block.type === 'text') {
        text += block.text;
      }
    }

    return { ok: true, text, model, provider: 'anthropic', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: String(e), provider: 'anthropic' };
  }
}

async function callOpenAI(systemPrompt, userPrompt, model = OPENAI_GPT4O, maxTokens = 5000) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return { ok: false, error: 'OPENAI_API_KEY not configured', provider: 'openai' };
  }

  const payload = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: payload,
    });

    const body = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: `OpenAI ${response.status}: ${JSON.stringify(body)}`,
        provider: 'openai',
      };
    }

    const text = body.choices[0].message.content;
    return { ok: true, text, model, provider: 'openai', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: String(e), provider: 'openai' };
  }
}

async function callOpenAIWebSearch(systemPrompt, userPrompt, model = 'gpt-4o-search-preview', maxTokens = 5000) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return { ok: false, error: 'OPENAI_API_KEY not configured', provider: 'openai_search' };
  }

  const payload = JSON.stringify({
    model,
    max_tokens: maxTokens,
    web_search_options: { search_context_size: 'medium' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: payload,
    });

    const body = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: `OpenAI Search ${response.status}: ${JSON.stringify(body)}`,
        provider: 'openai_search',
      };
    }

    const text = body.choices[0].message.content;
    return { ok: true, text, model, provider: 'openai_search', usage: body.usage || {} };
  } catch (e) {
    return { ok: false, error: String(e), provider: 'openai_search' };
  }
}

async function callAI(systemPrompt, userPrompt, modelPreference = 'sonnet', maxTokens = 5000, useSearch = false) {
  if (useSearch) {
    const result = await callOpenAIWebSearch(systemPrompt, userPrompt, 'gpt-4o-search-preview', maxTokens);
    if (result.ok) return result;
    return callOpenAI(systemPrompt, userPrompt, OPENAI_GPT4O, maxTokens);
  }

  const claudeModel = modelPreference === 'sonnet' ? CLAUDE_SONNET : CLAUDE_HAIKU;
  const openaiModel = (modelPreference === 'sonnet' || modelPreference === 'gpt4o') ? OPENAI_GPT4O : OPENAI_GPT4O_MINI;

  const result = await callAnthropic(systemPrompt, userPrompt, claudeModel, maxTokens);
  if (result.ok) return result;

  return callOpenAI(systemPrompt, userPrompt, openaiModel, maxTokens);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(400).json({ error: 'POST required' });
  }

  const body = req.body || {};
  const action = body.action || '';

  if (action === 'health') {
    return res.status(200).json({
      ok: true,
      providers: ['anthropic', 'openai'],
      models: {
        fast: CLAUDE_HAIKU,
        strategy: CLAUDE_SONNET,
        fallback_fast: OPENAI_GPT4O_MINI,
        fallback_strategy: OPENAI_GPT4O,
        web_search: 'gpt-4o-search-preview',
      },
    });
  }

  if (action === 'scan_website') {
    const url = (body.url || '').trim();
    if (!url) return res.status(400).json({ error: 'URL required' });

    const systemPrompt = 'Search the web for the company at the given URL. Then return ONLY valid JSON with the extracted data. No markdown, no backticks, no commentary. If you cannot determine a field, use empty string "". Keep all values on a single line.';
    const userPrompt = `Search for this company: ${url}\n\nFind what they do, what they sell, target market, value props, industry, company size, and differentiators.\n\nAfter searching, return ONLY this JSON structure with fields filled from your research:\n\n{"company":{"name":"","website":"${url}","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;

    const result = await callAI(systemPrompt, userPrompt, 'haiku', 3000, true);
    return res.status(200).json(result);
  }

  if (action === 'extract_notes') {
    const notesText = (body.notes || '').trim();
    const source = body.source || 'raw';
    if (!notesText) return res.status(400).json({ error: 'Notes text required' });

    const systemPrompt = `STRICT JSON OUTPUT MODE. Return ONLY valid JSON. No markdown. No backticks. No commentary. No trailing commas. Escape all quotes inside strings. No newlines inside string values.\n\nYou are extracting client intake data from meeting notes (likely from Circleback, Granola, Fathom, Otter, or similar AI notetaker).\n\nThese notes contain a conversation about a client's business, offer, target market, pain points, and goals. Extract as much structured data as possible.\n\nFor fields you cannot determine, use empty string "". Do not fabricate. Only extract what is explicitly mentioned or clearly implied in the notes.`;
    const userPrompt = `Extract intake form data from these meeting notes.\n\nSOURCE: ${source}\n\nNOTES:\n${notesText}\n\nReturn ONLY this JSON. Fill every field you can extract. Empty string for unknowns.\n\n{"company":{"name":"","website":"","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;

    const result = await callAI(systemPrompt, userPrompt, 'haiku', 3000);
    return res.status(200).json(result);
  }

  if (action === 'strategy_part_a') {
    const companyName = body.company_name || '';
    const intakeBlock = body.intake_block || '';
    const model = body.model || 'sonnet';
    if (!intakeBlock) return res.status(400).json({ error: 'intake_block required' });

    const systemPrompt = `Output ONLY valid JSON. No markdown, no backticks, no commentary. Single-line string values. Escape quotes with backslash.\nRules: VP+ seniority default. Observation > Offer tone. Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing" `;
    const userPrompt = `Strategy Part A for: ${companyName}\n\n${intakeBlock}\n\nReturn JSON:\n{"client_name":"","offer_summary":"","icp_summary":"","icp_refinement":{"primary_segments":[{"segment":"","description":"","fit_score":85},{"segment":"","description":"","fit_score":75}],"secondary_segments":[{"segment":"","description":"","fit_score":60}],"narrowing_recommendations":["",""],"red_flags":["",""]},"decision_maker_targeting":{"seniority_policy":"VP_PLUS_DEFAULT","primary_titles":[{"title":"","rationale":""},{"title":"","rationale":""}],"secondary_titles":[{"title":"","rationale":""}],"avoid_titles":["",""],"buying_committee":{"who_cares":"","who_signs":"","who_influences":"","who_blocks":""}},"channel_strategy":{"primary_channel":"","channel_breakdown":[{"channel":"","usage":"","daily_volume":"","notes":""}],"pacing":{"ramp_week_1":"","steady_state":"","multi_sender":""},"warm_vs_cold":""},"messaging_angles":{"angles":[{"name":"","description":"","when_to_use":"","example_hook":"","strength":85},{"name":"","description":"","when_to_use":"","example_hook":"","strength":80}],"lead_with":{"insight":"","curiosity":"","credibility":""},"never_say":["",""]},"value_prop_framing":{"first_touch_simplification":"","outcome_emphasis":{"primary":"","secondary":"","tertiary":""},"proof_point_strategy":{"hint_in_outreach":["",""],"save_for_calls":["",""]}},"meeting_booking":{"cta_style":{"recommended":"","description":"","examples":["",""]},"calendar_link_timing":"","friction_reduction":["",""],"no_show_prevention":["",""]}}`;

    const result = await callAI(systemPrompt, userPrompt, model, 4000);
    return res.status(200).json(result);
  }

  if (action === 'strategy_part_b') {
    const companyName = body.company_name || '';
    const intakeBlock = body.intake_block || '';
    const model = body.model || 'sonnet';
    if (!intakeBlock) return res.status(400).json({ error: 'intake_block required' });

    const systemPrompt = `Output ONLY valid JSON. No markdown, no backticks, no commentary. Single-line string values. Escape quotes with backslash.\nRules: VP+ seniority default. Observation > Offer tone. Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing" `;
    const userPrompt = `Strategy Part B for: ${companyName}\n\n${intakeBlock}\n\nReturn JSON:\n{"sales_nav":{"recommended_filters":{"geography":[""],"company_size":{"min":50,"max":500},"industries":[""],"seniority":[""],"exclude_industries":[""]},"title_patterns":{"high_performers":["",""],"boolean_string":""},"profile_red_flags":["",""]},"campaign_risks":{"likely_objections":[{"objection":"","response_angle":""},{"objection":"","response_angle":""}],"success_signals":["",""],"failure_signals":["",""],"week_1_2_adjustments":["",""]},"targeting":{"seniority_policy":"VP_PLUS_DEFAULT","title_clusters":[{"cluster":"","titles":["",""],"notes":""},{"cluster":"","titles":[""],"notes":""}],"filters":{"company_size_min":50,"company_size_max":500,"industries_include":[""],"exclude":[""]}},"positioning":{"primary_angle":"","philosophy":"","avoid":["",""],"hooks":["",""]},"conversation_flow":{"connect_note":"","message_1":{"label":"","text":"","quality_score":85,"quality_notes":""},"message_2":{"label":"","text":"","quality_score":85,"quality_notes":""},"message_3":{"label":"","text":"","quality_score":85,"quality_notes":""},"cta_rules":"","tone_rules":"","strict_avoid":["",""]},"follow_up":{"cadence":"","philosophy":"","themes":[{"touch":1,"theme":"","angle":""},{"touch":2,"theme":"","angle":""},{"touch":3,"theme":"","angle":""}]},"ridge_execution_notes":{"personalization":"","message_philosophy":"","quality_benchmark":"","risks":["",""],"next_steps":["","",""]}}`;

    const result = await callAI(systemPrompt, userPrompt, model, 4000);
    return res.status(200).json(result);
  }

  if (action === 'summarize_section') {
    const sectionData = body.section_data || '';
    const clientName = body.client_name || '';
    const sectionName = body.section_name || '';
    if (!sectionData) return res.status(400).json({ error: 'section_data required' });

    const systemPrompt = "You write concise, professional summaries for sales teams. Write in plain language, no markdown, no bullet points, no headers. Write as 2-4 short paragraphs that someone can copy-paste into a Slack message or email to a client/prospect. Reference the client by name. Be specific — use actual data from the section. Keep it under 200 words.";
    const userPrompt = `Summarize this ${sectionName} section for ${clientName}:\n\n${sectionData}`;

    const result = await callAI(systemPrompt, userPrompt, 'haiku', 1000);
    return res.status(200).json(result);
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
};
