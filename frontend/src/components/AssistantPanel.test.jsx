import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/client.js', async () => (await import('../test/mockApi.js')).makeApiMock());

import * as api from '../api/client.js';
import { apiError } from '../test/mockApi.js';
import AssistantPanel from './AssistantPanel.jsx';
import AssistantPage from '../pages/AssistantPage.jsx';

const status = (over = {}) => ({ reachable: true, status: 'ok', llmConfigured: true, rowValuesAllowed: true, generalChatAllowed: true, ...over });
const source = (over = {}) => ({ id: 'S1', title: 'Ransomware Guide', publisher: 'CISA', url: 'https://example.org/g', reference: '', section: 'Containment', snippet: 'Isolate hosts.', cited: true, ...over });
const answer = (over = {}) => ({
  question: 'q', answer: 'Isolate the host [S1].', generated: true, model: 'gemini-x', sources: [source()], notes: [], context: 'alert', rowValuesSent: false, ...over,
});

const generalAnswer = (over = {}) => ({
  question: 'q', answer: 'Hello! I am fine.', generated: true, model: 'gemini-x', sources: [], context: 'none', mode: 'general', rowValuesSent: false,
  notes: ['General answer from an AI model. It is not based on your reference documents or your data, has no sources, and can be wrong.'], ...over,
});

const renderPanel = (props) => render(<MemoryRouter><AssistantPanel {...props} /></MemoryRouter>);
const ask = (text) => {
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getAssistantStatus.mockResolvedValue(status());
});

describe('AssistantPanel', () => {
  it('keeps Ask disabled until the question is long enough', async () => {
    renderPanel({ target: { alertId: 'a1' } });
    const button = screen.getByRole('button', { name: 'Ask' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'ab' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why flagged?' } });
    expect(button).toBeEnabled();
  });

  it('sends only the record id and the trimmed question, and shows the answer with its sources', async () => {
    api.askAssistant.mockResolvedValue(answer());
    renderPanel({ target: { alertId: 'a1' } });
    ask('  Why was this flagged?  ');
    expect(await screen.findByText('Isolate the host [S1].')).toBeInTheDocument();
    expect(api.askAssistant).toHaveBeenCalledWith({ question: 'Why was this flagged?', alertId: 'a1' });
    const link = screen.getByRole('link', { name: 'Ransomware Guide' });
    expect(link).toHaveAttribute('href', 'https://example.org/g');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('cited in the answer')).toBeInTheDocument();
    expect(screen.getByText(/It can be wrong/)).toBeInTheDocument();
  });

  it('renders the answer and passages as plain text, never as HTML', async () => {
    api.askAssistant.mockResolvedValue(answer({ answer: '<img src=x onerror=alert(1)> done', sources: [source({ snippet: '<script>x</script>' })] }));
    const { container } = renderPanel({ target: {} });
    ask('Tell me something');
    await screen.findByText(/done/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows a source with no link as team notes, not as a link', async () => {
    api.askAssistant.mockResolvedValue(answer({ sources: [source({ url: null, title: 'Study notes', cited: false })] }));
    renderPanel({ target: {} });
    ask('What is DoS?');
    expect(await screen.findByText('Study notes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Study notes' })).toBeNull();
    expect(screen.getByText(/not an official source/)).toBeInTheDocument();
  });

  it('says plainly when no written answer was produced, and shows the notes and passages instead', async () => {
    api.askAssistant.mockResolvedValue(answer({ answer: null, generated: false, notes: ['No language model is configured.'] }));
    renderPanel({ target: {} });
    ask('What is DoS?');
    expect(await screen.findByText('No written answer was produced.')).toBeInTheDocument();
    expect(screen.getByText('No language model is configured.')).toBeInTheDocument();
    expect(screen.getByText('Ransomware Guide')).toBeInTheDocument();
  });

  it('says so when no passage matched', async () => {
    api.askAssistant.mockResolvedValue(answer({ sources: [], notes: ['No reference passage matched this question.'] }));
    renderPanel({ target: {} });
    ask('Something unrelated');
    expect(await screen.findByText('No reference passage matched this question.', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows the server error and allows trying again', async () => {
    api.askAssistant.mockRejectedValue(apiError(429, 'The language-model usage limit was reached. Wait a while and try again.'));
    renderPanel({ target: {} });
    ask('What is DoS?');
    expect(await screen.findByRole('alert')).toHaveTextContent('usage limit was reached');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });
});

describe('row values choice', () => {
  it('is unchecked by default, warns about Google’s free-tier terms, and is not sent unless ticked', async () => {
    api.askAssistant.mockResolvedValue(answer());
    renderPanel({ target: { alertId: 'a1' } });
    const box = await screen.findByRole('checkbox');
    expect(box).not.toBeChecked();
    expect(screen.getByText(/human reviewers/)).toBeInTheDocument();
    ask('Why flagged?');
    await screen.findByText('Isolate the host [S1].');
    expect(api.askAssistant.mock.calls[0][0]).not.toHaveProperty('includeRowValues');
  });

  it('sends includeRowValues only when ticked, and says so in the result', async () => {
    api.askAssistant.mockResolvedValue(answer({ rowValuesSent: true }));
    renderPanel({ target: { alertId: 'a1' } });
    fireEvent.click(await screen.findByRole('checkbox'));
    ask('Why flagged?');
    expect(await screen.findByText(/Raw row values were included/)).toBeInTheDocument();
    expect(api.askAssistant).toHaveBeenCalledWith({ question: 'Why flagged?', alertId: 'a1', includeRowValues: true });
  });

  it('is not offered for incidents, general questions, or when the server forbids it', async () => {
    const { unmount } = renderPanel({ target: { incidentId: 'i1' } });
    await screen.findByRole('button', { name: 'Ask' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();
    api.getAssistantStatus.mockResolvedValue(status({ rowValuesAllowed: false }));
    renderPanel({ target: { alertId: 'a1' } });
    await screen.findByRole('button', { name: 'Ask' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('status banners', () => {
  it('warns that only passages will be shown when no language model is set up', async () => {
    api.getAssistantStatus.mockResolvedValue(status({ llmConfigured: false }));
    renderPanel({ target: {} });
    expect(await screen.findByText(/only get the matching reference passages/)).toBeInTheDocument();
  });

  it('says the AI service is not running and disables Ask', async () => {
    api.getAssistantStatus.mockResolvedValue({ reachable: false, error: 'AI service is unreachable' });
    renderPanel({ target: {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('AI service is not running');
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What is DoS?' } });
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });
});

describe('AssistantPage', () => {
  it('offers a general question with no alert or incident attached', async () => {
    api.askAssistant.mockResolvedValue(answer({ context: 'none' }));
    render(<MemoryRouter><AssistantPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Assistant' })).toBeInTheDocument();
    ask('What is reconnaissance?');
    await screen.findByText('Isolate the host [S1].');
    expect(api.askAssistant).toHaveBeenCalledWith({ question: 'What is reconnaissance?' });
  });

  it('offers cited answers and general chat, with cited answers selected first', async () => {
    render(<MemoryRouter><AssistantPage /></MemoryRouter>);
    expect(await screen.findByRole('radio', { name: /Cited answers/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /General chat/ })).toBeInTheDocument();
  });
});


describe('General chat mode', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('is offered only where allowGeneral is set, never on alert or incident panels', async () => {
    renderPanel({ target: { alertId: 'a1' } });
    await screen.findByRole('button', { name: 'Ask' });
    await settle();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('is hidden when the server turns it off', async () => {
    api.getAssistantStatus.mockResolvedValue(status({ generalChatAllowed: false }));
    renderPanel({ allowGeneral: true });
    await screen.findByRole('button', { name: 'Ask' });
    await settle();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('starts in cited mode and offers both choices', async () => {
    renderPanel({ allowGeneral: true });
    expect(await screen.findByRole('radio', { name: /Cited answers/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /General chat/ })).not.toBeChecked();
    expect(screen.queryByText(/do not type real company or personal data/)).toBeNull();
  });

  it('warns, sends only the question to the general endpoint, and shows an unverified answer with no Sources section', async () => {
    api.askGeneral.mockResolvedValue(generalAnswer());
    renderPanel({ allowGeneral: true });
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    expect(screen.getByText(/do not type real company or personal data/)).toBeInTheDocument();
    ask('  hi how are you  ');
    expect(await screen.findByText('Hello! I am fine.')).toBeInTheDocument();
    expect(api.askGeneral).toHaveBeenCalledWith({ question: 'hi how are you' });
    expect(api.askAssistant).not.toHaveBeenCalled();
    expect(screen.getByText(/Not verified: it has no sources/)).toBeInTheDocument();
    expect(screen.getByText(/not based on your reference documents/)).toBeInTheDocument();
    expect(screen.queryByText('Sources')).toBeNull();
  });

  it('renders a general answer as plain text, never as HTML', async () => {
    api.askGeneral.mockResolvedValue(generalAnswer({ answer: '<img src=x onerror=alert(1)> done' }));
    const { container } = renderPanel({ allowGeneral: true });
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    ask('Tell me something');
    await screen.findByText(/done/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('clears the old answer when the mode changes, and cited mode still uses the cited endpoint', async () => {
    api.askGeneral.mockResolvedValue(generalAnswer());
    api.askAssistant.mockResolvedValue(answer({ context: 'none' }));
    renderPanel({ allowGeneral: true });
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    ask('hi how are you');
    await screen.findByText('Hello! I am fine.');
    fireEvent.click(screen.getByRole('radio', { name: /Cited answers/ }));
    expect(screen.queryByText('Hello! I am fine.')).toBeNull();
    ask('What is DoS?');
    expect(await screen.findByText('Isolate the host [S1].')).toBeInTheDocument();
    expect(api.askAssistant).toHaveBeenCalledWith({ question: 'What is DoS?' });
    expect(api.askGeneral).toHaveBeenCalledTimes(1);
  });

  it('allows longer questions in general mode (1000) than in cited mode (500)', async () => {
    renderPanel({ allowGeneral: true });
    const box = await screen.findByLabelText('Your question');
    expect(box).toHaveAttribute('maxlength', '500');
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    expect(screen.getByLabelText('Your question')).toHaveAttribute('maxlength', '1000');
  });

  it('shows the server error and allows trying again', async () => {
    api.askGeneral.mockRejectedValue(apiError(429, 'The language-model usage limit was reached. Wait a while and try again.'));
    renderPanel({ allowGeneral: true });
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    ask('hi how are you');
    expect(await screen.findByRole('alert')).toHaveTextContent('usage limit was reached');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });

  it('says General chat cannot answer, and disables Ask, when no language model is set up', async () => {
    api.getAssistantStatus.mockResolvedValue(status({ llmConfigured: false }));
    renderPanel({ allowGeneral: true });
    fireEvent.click(await screen.findByRole('radio', { name: /General chat/ }));
    expect(await screen.findByText(/General chat cannot answer/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'hi how are you' } });
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });
});
