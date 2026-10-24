import { cleanNickname, nicknameError } from './nickname';

describe('nickname', () => {
  it('should trim and collapse spaces', () => {
    expect(cleanNickname('  Оля   К ')).toBe('Оля К');
  });

  it('should accept a normal nickname', () => {
    expect(nicknameError('Оля')).toBeNull();
    expect(nicknameError('a'.repeat(20))).toBeNull();
  });

  it('should reject too short, empty and too long ones', () => {
    expect(nicknameError('О')).toContain('щонайменше');
    expect(nicknameError('   ')).toContain('щонайменше');
    expect(nicknameError('a'.repeat(21))).toContain('не довшим');
  });

  it('should reject "@" so a nickname cannot pose as an email', () => {
    expect(nicknameError('olga@example.com')).toContain('@');
  });
});
