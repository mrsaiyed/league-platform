import { state, ui, $, esc } from '@demo/context';
import { icon, button } from '@demo/components';
function showModal(content, wide = false) {
  ui.modalBack = document.activeElement;
  $('#modal-root').innerHTML = /* HTML */ `<div class="modal-overlay">
    <section
      class="modal ${wide ? 'wide' : ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <button class="modal-close" data-action="close" aria-label="Close dialog">
        ${icon('close')}</button
      >${content}
    </section>
  </div>`;
  document.body.style.overflow = 'hidden';
  $('.modal-close').focus();
}
function closeModal() {
  const restore = ui.modalBack;
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  if (restore?.isConnected) restore.focus();
}
function guide() {
  showModal(
    /* HTML */ `<div class="eyebrow">A five-minute walkthrough</div>
      <h2 id="dialog-title">Show the principal the whole story.</h2>
      <p>
        Start with the student experience, then show how the school runs it. Every screen uses
        fictional records and illustrative policies.
      </p>
      <div class="guide-steps">
        ${[
          [
            '01',
            'A league that feels like Al-Hadi',
            'School branding, upcoming games, teams, and standings.',
            'home',
          ],
          [
            '02',
            'A simple path to sign up',
            'Pay at application, then see school-review and waitlist status.',
            'register',
          ],
          [
            '03',
            'The school stays in control',
            'Review eligibility and manage paid registrations privately.',
            'admin/registrations',
          ],
          [
            '04',
            'Draft together on one call',
            'One host, four captains, live rosters, and reversible picks.',
            'admin/draft',
          ],
          [
            '05',
            'Record it once. Follow it everywhere.',
            'Points, lineups, and playing time in the scorekeeper view.',
            'admin/scoring',
          ],
          [
            '06',
            'Make it your own',
            'Change the accent and switch optional public sections on or off.',
            'admin/settings',
          ],
        ]
          .map(
            ([n, t, d, r]) =>
              /* HTML */ `<button class="guide-step" data-action="guide-go" data-route="${r}">
                <span>${n}</span>
                <div><b>${t}</b><small>${d}</small></div>
              </button>`,
          )
          .join('')}
      </div>
      <div class="modal-note">
        <b>Presentation note:</b> These screens show several stages of a season. The draft
        rehearsal, generated schedule, and sample public results are separate examples. No school
        approval, live launch, payment integration, or production security is implied.
      </div>
      <div class="modal-actions">
        ${button('Start with the homepage ' + icon('arrow'), 'guide-go', 'data-route="home"')}
      </div>`,
    true,
  );
}
function review(id) {
  const a = state.applications.find((a) => a.id === id);
  showModal(
    /* HTML */ `<div class="eyebrow">Private eligibility review</div>
      <h2 id="dialog-title">${esc(a.name)}</h2>
      <p>Verify enrollment and grade with the school before approving this student.</p>
      <div class="info-list">
        <div><span>GRADE</span><strong>Grade ${a.grade}</strong></div>
        <div>
          <span>PAYMENT</span
          ><strong
            >${a.payment === 'paid' ? '$75 paid · simulated' : 'Refunded · simulated'}</strong
          >
        </div>
        <div>
          <span>CONTACT · FICTIONAL</span
          ><strong style="font-size:12px;overflow-wrap:anywhere">${esc(a.email)}</strong>
        </div>
        <div><span>PLACEMENT</span><strong>${esc(a.placement)}</strong></div>
      </div>
      <label class="check-row"
        ><input
          type="checkbox"
          id="eligibility-check"
          ${a.review === 'approved' ? 'checked' : ''}
        /><span
          >I have checked school enrollment and grade eligibility in this demonstration.</span
        ></label
      >
      <div class="modal-actions">
        ${button('Close', 'close', '', 'btn-ghost')}${button(
          a.review === 'approved' ? 'Already approved' : 'Approve student',
          'approve',
          `data-id="${a.id}" ${a.review === 'approved' ? 'disabled' : ''}`,
        )}
      </div>`,
  );
}
function payModal(form) {
  const values = new FormData(form);
  const candidate = {
    name: String(values.get('name')).trim(),
    grade: Number(values.get('grade')),
    email: String(values.get('email')).trim(),
  };
  showModal(
    /* HTML */ `<div class="eyebrow">Simulated checkout</div>
      <h2 id="dialog-title">One step closer to the season.</h2>
      <p>This is a payment preview. No card fields, charge, or payment service are connected.</p>
      <div class="info-list">
        <div><span>APPLICANT</span><strong>${esc(candidate.name)}</strong></div>
        <div><span>PARTICIPATION FEE</span><strong>$75.00 · USD</strong></div>
      </div>
      <div class="modal-note">
        Your sample application will enter the paid waitlist pending school review. Paying does not
        guarantee a playing place. Refund timing and amounts require the school’s final policy.
      </div>
      <div class="modal-actions">
        ${button('Back', 'close', '', 'btn-ghost')}${button(
          'Simulate $75 payment ' + icon('arrow'),
          'pay',
        )}
      </div>`,
  );
  showModal.candidate = candidate;
}

export { showModal, closeModal, guide, review, payModal };
