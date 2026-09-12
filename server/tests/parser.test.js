import assert from 'node:assert';
import { areNearDuplicateQuestions, parseQuestions, normalizeQuestion, prepareQuestion } from '../parser.js';

console.log('--- Running Parser & Normalizer Tests ---');

// 1. Test normalization
{
  const text1 = 'What is the capital of India?';
  const text2 = 'what is the capital of india';
  const text3 = 'What is the Capital of India??? ';

  assert.strictEqual(normalizeQuestion(text1), 'what is the capital of india');
  assert.strictEqual(normalizeQuestion(text2), 'what is the capital of india');
  assert.strictEqual(normalizeQuestion(text3), 'what is the capital of india');
  console.log('✓ Normalization test passed: identical normalization across case and punctuation');
}

// 1b. Near-duplicate detection ignores a minor character change.
{
  const original = 'Which of the three banks will be merged with the other two to create India third largest bank?';
  const typo = 'Which of the three banks will be merged with the other two to create India third largset bank?';
  const different = 'Which bank has the highest interest rate for savings accounts?';

  assert.strictEqual(areNearDuplicateQuestions(original, typo), true);
  assert.strictEqual(areNearDuplicateQuestions(original, different), false);
  assert.strictEqual(areNearDuplicateQuestions('Who is ninja', 'Who is a ninja'), true);
  console.log('✓ Near-duplicate test passed: minor character changes are detected');
}

// 2. Test plain text parsing with options and question numbers
{
  const sampleText = `
1. What is the capital of India?
A. Mumbai
B. Delhi
C. Chennai
D. Kolkata

Answer: B

2. Which planet is known as the Red Planet?
(A) Earth
(B) Mars
(C) Jupiter
(D) Saturn
`;

  const questions = parseQuestions(sampleText, 'text');
  assert.strictEqual(questions.length, 2, 'Should parse exactly 2 questions');
  
  assert.strictEqual(questions[0].question_text, 'What is the capital of India?');
  assert.strictEqual(questions[0].options.length, 4);
  assert.strictEqual(questions[0].options[0].key, 'A');
  assert.strictEqual(questions[0].options[0].text, 'Mumbai');
  assert.strictEqual(questions[0].options[1].key, 'B');
  assert.strictEqual(questions[0].options[1].text, 'Delhi');

  // Verify answer line was stripped and not set
  assert.strictEqual(questions[0].correct_answer, undefined);

  assert.strictEqual(questions[1].question_text, 'Which planet is known as the Red Planet?');
  assert.strictEqual(questions[1].options[1].key, 'B');
  assert.strictEqual(questions[1].options[1].text, 'Mars');

  console.log('✓ Plain text parsing test passed: options captured and answers stripped');
}

// 3. Test CSV parsing
{
  const csvContent = `question,option_a,option_b,option_c,option_d,answer
"What is the largest ocean?","Atlantic","Indian","Pacific","Arctic","C"
"What is 2+2?","1","2","3","4","D"`;

  const questions = parseQuestions(csvContent, 'csv');
  assert.strictEqual(questions.length, 2);
  assert.strictEqual(questions[0].question_text, 'What is the largest ocean?');
  assert.strictEqual(questions[0].options.length, 4);
  assert.strictEqual(questions[0].options[2].key, 'C');
  assert.strictEqual(questions[0].options[2].text, 'Pacific');
  // Confirm answer column is stripped
  assert.strictEqual(questions[0].correct_answer, undefined);

  console.log('✓ CSV parsing test passed: headers recognized, answer column stripped');
}

// 4. Test JSON parsing
{
  const jsonContent = JSON.stringify([
    {
      question: 'What is the capital of France?',
      options: ['A. Paris', 'B. Lyon', 'C. Nice', 'D. Marseille'],
      correct_answer: 'A'
    }
  ]);

  const questions = parseQuestions(jsonContent, 'json');
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].question_text, 'What is the capital of France?');
  assert.strictEqual(questions[0].options[0].key, 'A');
  assert.strictEqual(questions[0].options[0].text, 'Paris');
  assert.strictEqual(questions[0].correct_answer, undefined);

  console.log('✓ JSON parsing test passed: client answer stripped');
}

console.log('All parser unit tests passed!\n');

// Prefixes, case, punctuation and whitespace must produce the same canonical identity.
{
  const variants = ['1. What is the capital of India?', 'Q1: What is the capital of India?', 'Question: What is the capital of India?', 'Important Question: What is the capital of India?', 'WHAT IS THE CAPITAL OF INDIA ?'];
  const canonical = variants.map(value => prepareQuestion({ question_text: value }).canonical_question);
  assert.deepStrictEqual([...new Set(canonical)], ['what is the capital of india']);
  assert.strictEqual(prepareQuestion({ question_text: variants[4] }).display_question, 'What is the capital of india?');
  console.log('✓ Explicit prefixes and presentation-only differences share one canonical question');
}

{
  const input = `Important Question: 1. What is the capital of India?
A) Mumbai
B: Delhi
(C) Chennai
D. Kolkata`;
  const parsed = parseQuestions(input, 'text');
  const prepared = prepareQuestion(parsed[0]);
  assert.strictEqual(prepared.display_question, 'What is the capital of India?');
  assert.deepStrictEqual(prepared.options, [{ key: 'A', text: 'Mumbai' }, { key: 'B', text: 'Delhi' }, { key: 'C', text: 'Chennai' }, { key: 'D', text: 'Kolkata' }]);
  assert.deepStrictEqual(parseQuestions(input, 'pdf'), parsed, 'extracted PDF text uses the same parser');
  console.log('✓ MCQ options and extracted PDF text use the shared pipeline');
}

// Unlabeled option lines are assigned A-D, and numbered option lines do not
// become new questions even though they match the question-number pattern.
{
  const unlabeled = parseQuestions(`2) What is the name of the weak zone of the earth’s crust?

Seismic
Cosmic
Formic
Anaemic`, 'text');
  assert.strictEqual(unlabeled.length, 1);
  assert.deepStrictEqual(unlabeled[0].options, [
    { key: 'A', text: 'Seismic' }, { key: 'B', text: 'Cosmic' },
    { key: 'C', text: 'Formic' }, { key: 'D', text: 'Anaemic' }
  ]);

  const numbered = parseQuestions(`2. What is the name of the weak zone of the earth’s crust?
1)Seismic
2)Cosmic
Formic
Anaemic`, 'text');
  assert.strictEqual(numbered.length, 1);
  assert.deepStrictEqual(numbered[0].options, [
    { key: 'A', text: 'Seismic' }, { key: 'B', text: 'Cosmic' },
    { key: 'C', text: 'Formic' }, { key: 'D', text: 'Anaemic' }
  ]);
  console.log('✓ Unlabeled and numbered option lines are parsed as A-D options');
}

{
  const parsed = parseQuestions(`2) What is the name of the weak zone of the earth’s crust?
Seismic
Cosmic
Formic
Anaemic`);
  const prepared = prepareQuestion(parsed[0]);
  assert.strictEqual(prepared.display_question, 'What is the name of the weak zone of the earth’s crust?');
  assert.strictEqual(prepared.options.length, 4);
  console.log('✓ Four unlabeled lines remain separate from the question stem');
}

{
  const parsed = parseQuestions(`2\\) What is the name of the weak zone of the earth’s crust?
 1)Seismic
2\\)Cosmic
Formic
 Anaemic`);
  const prepared = prepareQuestion(parsed[0]);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(prepared.canonical_question, normalizeQuestion('What is the name of the weak zone of the earth’s crust?'));
  assert.deepStrictEqual(prepared.options, [
    { key: 'A', text: 'Seismic' }, { key: 'B', text: 'Cosmic' },
    { key: 'C', text: 'Formic' }, { key: 'D', text: 'Anaemic' }
  ]);
  console.log('✓ Escaped numbered question and option markers normalize correctly');
}

{
  const parsed = parseQuestions('Who is a baaka? Gurucharan Rushikesh both');
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].question_text, 'Who is a baaka?');
  assert.deepStrictEqual(parsed[0].options, [
    { key: 'A', text: 'Gurucharan' },
    { key: 'B', text: 'Rushikesh' },
    { key: 'C', text: 'both' }
  ]);
  console.log('✓ Inline unlabeled options after a question mark are separated');
}

{
  assert.strictEqual(prepareQuestion({ question_text: 'timer:00:03' }).valid, false);
  assert.strictEqual(prepareQuestion({ question_text: 'Who?' }).valid, false);
  console.log('✓ UI artifacts and uncertain short input are rejected');
}

{
  const parsed = parseQuestions(`timer:00:03

1. Which of the three banks will be merged with the other two to create India's third-largest bank?`, 'text');
  assert.strictEqual(parsed.length, 1, 'timer must not become its own question');
  assert.strictEqual(prepareQuestion(parsed[0]).display_question, "Which of the three banks will be merged with the other two to create India's third-largest bank?");
  console.log('✓ UI timer is discarded before question extraction');
}
