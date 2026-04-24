// onboarding.jsx — first-run walkthrough + new-session setup

function FirstRunOnboarding({ onDone, profile, setProfile, addProvider, toast }) {
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState({
    nickname: profile.nickname || '',
    role: profile.role || '',
    tone: profile.tone || 'Warm but concise',
  });
  const [providerId, setProviderId] = React.useState('anthropic');
  const [apiKey, setApiKey] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [verified, setVerified] = React.useState(false);

  const prov = PROVIDERS.find(p => p.id === providerId);

  const steps = [
    { label: 'Welcome' },
    { label: 'About you' },
    { label: 'Model provider' },
    { label: 'Sign in' },
  ];

  const next = () => setStep(s => Math.min(steps.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const test = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setVerified(true);
    }, 900);
  };

  const finish = () => {
    setProfile({ ...profile, ...draft });
    if (verified) {
      addProvider(providerId, apiKey);
    }
    onDone();
    toast('You\'re all set — welcome to folk', 'ok');
  };

  const canNext = () => {
    if (step === 1) return draft.nickname.trim().length > 0;
    if (step === 2) return !!providerId;
    if (step === 3) return verified;
    return true;
  };

  return (
    <div className="ob-scrim">
      <div className="ob-card">
        <div className="ob-head">
          <div className="ob-logo">
            <div className="sb-logo" style={{ width: 28, height: 28, fontSize: 13 }}><span>f</span></div>
            <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--heading)', letterSpacing: '-0.01em' }}>folk</span>
          </div>
          <div className="ob-steps">
            {steps.map((s, i) => (
              <div key={i} className={'ob-step' + (i === step ? ' on' : '') + (i < step ? ' done' : '')}>
                <div className="ob-step-dot">{i < step ? <Icon name="check" size={10} /> : i + 1}</div>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ob-body">
          {step === 0 && (
            <div className="ob-welcome">
              <div className="ob-hero">
                <div className="ob-hero-mark">
                  <div className="sb-logo" style={{ width: 56, height: 56, fontSize: 24 }}><span>f</span></div>
                </div>
                <h1 className="ob-title">Meet folk.</h1>
                <p className="ob-lede">
                  A local-first way to work with any model, with your tools and your files.
                  Takes about a minute to set up.
                </p>
              </div>
              <div className="ob-points">
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="lock" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Runs on your machine</div>
                    <div className="ob-point-p">Your data, history, and keys stay in macOS Keychain — never synced to folk.</div>
                  </div>
                </div>
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="cpu" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Bring your own model</div>
                    <div className="ob-point-p">Anthropic, OpenAI, Moonshot, Ollama — swap providers per session.</div>
                  </div>
                </div>
                <div className="ob-point">
                  <div className="ob-point-ic"><Icon name="wrench" size={14} /></div>
                  <div>
                    <div className="ob-point-h">Your tools, always ready</div>
                    <div className="ob-point-p">MCP servers, skills, and plugins — installed and managed in one place.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">How should folk refer to you?</h2>
              <p className="ob-step-sub">Just the basics — you can fill in the rest later on your Profile page.</p>
              <div className="ob-avatar-preview">
                <div className="prof-av-lg">{(draft.nickname || 'Y').slice(0, 1).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--heading)' }}>{draft.nickname || 'Your nickname'}</div>
                  <div className="sub" style={{ fontSize: 13 }}>{draft.role || 'What you do'}</div>
                </div>
              </div>

              <div className="field">
                <label className="label">Nickname <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— what folk calls you</span></label>
                <input className="input" autoFocus value={draft.nickname}
                  onChange={e => setDraft(d => ({ ...d, nickname: e.target.value }))}
                  placeholder="e.g. Jamie" onKeyDown={e => e.key === 'Enter' && canNext() && next()} />
              </div>
              <div className="field">
                <label className="label">Role or what you do <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— optional</span></label>
                <input className="input" value={draft.role}
                  onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
                  placeholder="e.g. Product engineer at Acme" />
              </div>
              <div className="field">
                <label className="label">Preferred tone</label>
                <div className="segmented" style={{ width: 'fit-content' }}>
                  {['Warm but concise', 'Direct', 'Playful', 'Formal'].map(tone => (
                    <button key={tone} className={draft.tone === tone ? 'on' : ''}
                      onClick={() => setDraft(d => ({ ...d, tone }))}>{tone}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">Pick a model provider to start.</h2>
              <p className="ob-step-sub">You can add more any time from <b>Models &amp; Providers</b>.</p>

              <div className="ob-prov-grid">
                {PROVIDERS.map(p => (
                  <button key={p.id}
                    className={'ob-prov' + (providerId === p.id ? ' on' : '')}
                    onClick={() => setProviderId(p.id)}>
                    <span className={'prov-logo-lg ' + p.logoClass} style={{ width: 40, height: 40, fontSize: 14 }}>{p.logoText}</span>
                    <span className="ob-prov-name">{p.name}</span>
                    <span className="ob-prov-sub">{p.defaultModels.length} models</span>
                  </button>
                ))}
              </div>
              <div className="ob-note">
                <Icon name="info" size={13} />
                <span>folk is BYO-key. You pay your provider directly — folk takes no cut, sees no keys.</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="ob-step-body">
              <h2 className="ob-step-title">Sign in to {prov.name}.</h2>
              <p className="ob-step-sub">Paste your {prov.keyLabel.toLowerCase()} — we\'ll verify it and store it in macOS Keychain.</p>

              <div className="ob-key-panel">
                <div className="ob-key-hd">
                  <span className={'prov-logo-lg ' + prov.logoClass} style={{ width: 32, height: 32, fontSize: 12 }}>{prov.logoText}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--heading)' }}>{prov.name}</div>
                    <div className="sub" style={{ fontSize: 12 }}>{prov.baseUrl}</div>
                  </div>
                  <a className="btn btn-sm btn-plain" href="#" onClick={e => e.preventDefault()}>
                    <Icon name="external" size={12} /> Get a key
                  </a>
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label className="label">{prov.keyLabel}</label>
                  <input className="input mono" type="password"
                    placeholder={prov.keyPrefix ? `${prov.keyPrefix}…` : 'Paste your key'}
                    value={apiKey} onChange={e => { setApiKey(e.target.value); setVerified(false); }}
                    autoFocus />
                  <div className="hint">Stored in macOS Keychain. Never synced to folk.</div>
                </div>

                <div className="ob-key-actions">
                  {!verified && (
                    <button className="btn btn-primary"
                      onClick={test}
                      disabled={!apiKey.trim() || testing}>
                      {testing ? <><span className="spinner"></span> Verifying…</> : <>Verify key</>}
                    </button>
                  )}
                  {verified && (
                    <div className="ob-verified">
                      <div className="ob-verified-ic"><Icon name="check" size={14} /></div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--heading)', fontSize: 13 }}>Connected to {prov.name}</div>
                        <div className="sub" style={{ fontSize: 12 }}>{prov.defaultModels.length} models ready to use.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="ob-skip">
                Or <a href="#" onClick={e => { e.preventDefault(); onDone(); toast('Skipped — add a provider any time from Models & Providers', 'ok'); }}>skip for now</a> and set this up later.
              </div>
            </div>
          )}
        </div>

        <div className="ob-foot">
          {step > 0 ? (
            <button className="btn btn-plain" onClick={back}><Icon name="chevronLeft" size={12} /> Back</button>
          ) : <span />}
          <span style={{ flex: 1 }}></span>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={next} disabled={!canNext()}>
              {step === 0 ? 'Get started' : 'Continue'}
              <Icon name="chevronRight" size={12} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={!verified}>
              <Icon name="check" size={12} /> Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionSetup({ onStart, onCancel, model, setModel, configuredProviders }) {
  const [folder, setFolder] = React.useState('');
  const [goal, setGoal] = React.useState('general');
  const [advOpen, setAdvOpen] = React.useState(false);
  const [yolo, setYolo] = React.useState(false);
  const [yoloAck, setYoloAck] = React.useState(false);
  const [rawFlags, setRawFlags] = React.useState('');
  const recents = [
    { path: '~/Projects/folk', label: 'folk', sub: 'last opened 2m ago' },
    { path: '~/Projects/acme-web', label: 'acme-web', sub: 'last opened yesterday' },
    { path: '~/code/release-notes', label: 'release-notes', sub: 'last opened 3d ago' },
  ];

  const modelOpts = configuredProviders.flatMap(cp => {
    const def = PROVIDERS.find(p => p.id === cp.id);
    if (!def) return [];
    return cp.enabledModels.map(id => {
      const m = def.defaultModels.find(x => x.id === id);
      return { id, display: m?.display || id, providerName: def.name, providerClass: def.logoClass, providerLogo: def.logoText };
    });
  });

  const canStart = folder.trim().length > 0 && (!yolo || yoloAck);

  // preview of the command that will be executed
  const cmdPreview = React.useMemo(() => {
    const parts = ['claude-code'];
    if (model) parts.push(`--model ${model}`);
    if (folder) parts.push(`--cwd ${folder}`);
    if (yolo) parts.push('--dangerously-skip-permissions');
    if (rawFlags.trim()) parts.push(rawFlags.trim());
    return parts.join(' ');
  }, [model, folder, yolo, rawFlags]);

  return (
    <div className="ss-wrap" data-screen-label="Session setup">
      <div className="ss-card">
        <div className="ss-hd">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>New session</div>
            <h2 className="ss-title">Where should folk work?</h2>
            <p className="ss-sub">Pick a folder and a model. You can change the model mid-session; folder is locked once you start.</p>
          </div>
          <button className="btn btn-icon btn-plain" onClick={onCancel} title="Cancel">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="ss-body">
          <div className="ss-section">
            <div className="ss-section-lbl">Working folder</div>
            <div className="ss-folder-row">
              <div className="ss-folder-input">
                <Icon name="folder" size={14} />
                <input className="input mono" placeholder="~/code/my-project"
                  value={folder} onChange={e => setFolder(e.target.value)} />
              </div>
              <button className="btn btn-sm btn-plain"><Icon name="folder" size={12} /> Browse…</button>
            </div>
            <div className="ss-recents">
              <div className="ss-recents-lbl">Recent</div>
              {recents.map(r => (
                <button key={r.path} className={'ss-recent' + (folder === r.path ? ' on' : '')}
                  onClick={() => setFolder(r.path)}>
                  <Icon name="folder" size={13} />
                  <span className="ss-recent-name">{r.label}</span>
                  <span className="ss-recent-path mono trunc">{r.path}</span>
                  <span className="ss-recent-sub">{r.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ss-section">
            <div className="ss-section-lbl">Model</div>
            <div className="ss-model-grid">
              {modelOpts.slice(0, 6).map(m => (
                <button key={m.id} className={'ss-model' + (model === m.id ? ' on' : '')}
                  onClick={() => setModel(m.id)}>
                  <span className={'prov-logo-lg ' + m.providerClass} style={{ width: 24, height: 24, fontSize: 10 }}>{m.providerLogo}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ss-model-name trunc">{m.display}</span>
                    <span className="ss-model-sub">{m.providerName}</span>
                  </span>
                  {model === m.id && <Icon name="check" size={12} style={{ color: 'var(--stripe-purple)' }} />}
                </button>
              ))}
            </div>
          </div>

          <div className="ss-section">
            <div className="ss-section-lbl">What are you doing? <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>— optional</span></div>
            <div className="ss-goal-grid">
              {[
                { id: 'general', label: 'Just chat', hint: 'Open-ended, no tools yet' },
                { id: 'code', label: 'Write or edit code', hint: 'Filesystem + shell ready' },
                { id: 'research', label: 'Research / read', hint: 'Web + docs tools enabled' },
                { id: 'brainstorm', label: 'Brainstorm', hint: 'folk asks before starting' },
              ].map(g => (
                <button key={g.id} className={'ss-goal' + (goal === g.id ? ' on' : '')}
                  onClick={() => setGoal(g.id)}>
                  <span className="ss-goal-dot"></span>
                  <span>
                    <span className="ss-goal-label">{g.label}</span>
                    <span className="ss-goal-hint">{g.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="ss-section ss-adv-section">
            <button className={'ss-adv-toggle' + (advOpen ? ' open' : '')} onClick={() => setAdvOpen(o => !o)}>
              <span className="ss-adv-toggle-ic"><Icon name="sparkles" size={12} /></span>
              <span className="ss-adv-toggle-txt">
                <span className="ss-adv-toggle-label">Launch options</span>
                <span className="ss-adv-toggle-sub">
                  {!yolo && !rawFlags.trim() && 'Permissions, custom flags, and raw CLI args.'}
                  {yolo && !rawFlags.trim() && 'Permissions disabled.'}
                  {!yolo && rawFlags.trim() && 'Custom CLI flags set.'}
                  {yolo && rawFlags.trim() && 'Permissions disabled · custom flags.'}
                </span>
              </span>
              {(yolo || rawFlags.trim()) && (
                <span className="ss-adv-tag">
                  {yolo && <span className="ss-adv-pill warn"><span className="ss-adv-pill-dot"></span>skip-permissions</span>}
                  {rawFlags.trim() && <span className="ss-adv-pill">+flags</span>}
                </span>
              )}
              <span className="ss-adv-chev"><Icon name={advOpen ? 'chevronDown' : 'chevronRight'} size={12} /></span>
            </button>

            {advOpen && (
              <div className="ss-adv">
                {/* Permissions — styled as a two-option segmented card */}
                <div className="ss-opt-group">
                  <div className="ss-opt-head">
                    <span className="ss-opt-label">Permissions</span>
                    <span className="ss-opt-help">How should folk ask before touching your files?</span>
                  </div>
                  <div className="ss-perm-grid">
                    <button className={'ss-perm' + (!yolo ? ' on' : '')}
                      onClick={() => { setYolo(false); setYoloAck(false); }}>
                      <div className="ss-perm-ic safe"><Icon name="shield" size={14} /></div>
                      <div className="ss-perm-body">
                        <div className="ss-perm-title">Ask before every action <span className="ss-perm-reco">recommended</span></div>
                        <div className="ss-perm-sub">folk confirms before writes, shell commands, and network calls.</div>
                      </div>
                      {!yolo && <Icon name="check" size={12} className="ss-perm-check" />}
                    </button>
                    <button className={'ss-perm danger' + (yolo ? ' on' : '')}
                      onClick={() => setYolo(true)}>
                      <div className="ss-perm-ic risky"><Icon name="bolt" size={14} /></div>
                      <div className="ss-perm-body">
                        <div className="ss-perm-title">Skip permissions <span className="ss-perm-flag mono">--dangerously-skip-permissions</span></div>
                        <div className="ss-perm-sub">No prompts. folk runs tools, writes files, and executes shell commands freely.</div>
                      </div>
                      {yolo && <Icon name="check" size={12} className="ss-perm-check" />}
                    </button>
                  </div>

                  {yolo && (
                    <div className="ss-yolo-warn">
                      <div className="ss-yolo-warn-hd">
                        <Icon name="shield" size={13} />
                        <span>You're opting out of folk's safety net.</span>
                      </div>
                      <ul className="ss-yolo-warn-list">
                        <li>Any model can modify or delete files inside <span className="mono">{folder || '<your folder>'}</span>.</li>
                        <li>Shell commands like <span className="mono">rm</span> or <span className="mono">git push --force</span> run without a prompt.</li>
                        <li>Only use in a sandbox, VM, or throwaway directory you can restore.</li>
                      </ul>
                      <label className="ss-yolo-ack">
                        <input type="checkbox" checked={yoloAck} onChange={e => setYoloAck(e.target.checked)} />
                        <span>I understand and accept the risk.</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Raw flags — styled as its own card */}
                <div className="ss-opt-group">
                  <div className="ss-opt-head">
                    <span className="ss-opt-label">Extra flags</span>
                    <a className="ss-raw-link" href="#" onClick={e => e.preventDefault()}>
                      <Icon name="external" size={11} /> claude-code docs
                    </a>
                  </div>
                  <div className="ss-opt-help" style={{ marginBottom: 8 }}>Passed through to claude-code verbatim. Use for experimental or less-common flags.</div>
                  <div className="ss-raw-input">
                    <span className="ss-raw-prefix mono">$</span>
                    <input className="input mono" placeholder="--allowedTools=edit,bash --append-system-prompt ./prompt.md"
                      value={rawFlags} onChange={e => setRawFlags(e.target.value)} spellCheck={false} />
                  </div>
                </div>

                {/* Command preview */}
                <div className="ss-cmd">
                  <div className="ss-cmd-hd">
                    <Icon name="terminal" size={11} />
                    <span>Launch command</span>
                  </div>
                  <code className="ss-cmd-body mono">{cmdPreview}</code>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ss-foot">
          <span className="hint" style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            {yolo
              ? <><Icon name="shield" size={11} style={{ color: 'var(--warn)' }} /> Permissions prompts are disabled.</>
              : <><Icon name="lock" size={11} /> folk will ask before any write or shell command.</>
            }
          </span>
          <span style={{ flex: 1 }}></span>
          <button className="btn btn-plain" onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (yolo ? 'btn-danger-solid' : 'btn-primary')} disabled={!canStart}
            onClick={() => onStart({ folder, goal, model, yolo, rawFlags: rawFlags.trim() })}>
            <Icon name="bolt" size={12} /> {yolo ? 'Start session (skip permissions)' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FirstRunOnboarding, SessionSetup });
