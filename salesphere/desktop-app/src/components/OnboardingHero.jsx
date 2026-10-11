import Logo from './Logo'
import { useNav } from '../state'
import { IconArrowRight, IconChat, IconDatabase, IconLightbulb, IconLock } from './icons'

// Rich first-run hero shown on Overview when the database has no invoices.
export default function OnboardingHero() {
  const navigate = useNav()
  return (
    <div className="page">
      <section className="card onboard-hero">
        <div className="onboard-head">
          <Logo size={46} />
          <div className="onboard-head-text">
            <h2>Welcome to SalesSphere</h2>
            <p>
              Offline retail analytics for your shop. Bring in your billing data once and get
              instant sales, inventory and customer insight — everything stays on this machine,
              no internet required.
            </p>
          </div>
        </div>

        <ol className="onboard-steps">
          <li className="onboard-step active anim-in" style={{ '--i': 1 }}>
            <div className="onboard-step-top">
              <span className="onboard-step-num num">1</span>
              <strong className="onboard-step-title">Import your data</strong>
              <span className="onboard-step-icon">
                <IconDatabase size={17} />
              </span>
            </div>
            <p className="onboard-step-desc">
              Drop in a CSV or Excel export of invoices, customers and products. Files are
              validated row by row before anything is written.
            </p>
            <div className="onboard-step-action">
              <button type="button" className="btn btn-primary onboard-cta" onClick={() => navigate('import')}>
                Import your data
                <IconArrowRight size={15} />
              </button>
            </div>
          </li>

          <li className="onboard-step locked anim-in" style={{ '--i': 2 }}>
            <div className="onboard-step-top">
              <span className="onboard-step-num num">2</span>
              <strong className="onboard-step-title">Explore insights</strong>
              <span className="onboard-step-icon">
                <IconLightbulb size={17} />
              </span>
            </div>
            <p className="onboard-step-desc">
              Revenue trends, profit analysis, FSN stock classes, RFM customer segments and
              demand forecasts — generated from your import.
            </p>
            <div className="onboard-step-action">
              <span className="onboard-step-hint">
                <IconLock size={12} />
                Unlocks after import
              </span>
            </div>
          </li>

          <li className="onboard-step locked anim-in" style={{ '--i': 3 }}>
            <div className="onboard-step-top">
              <span className="onboard-step-num num">3</span>
              <strong className="onboard-step-title">Ask the chatbot</strong>
              <span className="onboard-step-icon">
                <IconChat size={17} />
              </span>
            </div>
            <p className="onboard-step-desc">
              Once your data is in, ask questions in plain English — the assistant answers with
              charts-ready tables and the SQL it used.
            </p>
            <div className="onboard-step-action">
              <span className="onboard-step-hint">
                <IconLock size={12} />
                Unlocks after import
              </span>
            </div>
          </li>
        </ol>
      </section>
    </div>
  )
}
