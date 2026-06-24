export interface Deviation {
    testPattern: string | RegExp;
    description: string;
    reason: 'intentional' | 'codemirror-limitation' | 'fixable' | 'environment';
    fields: ('content' | 'cursor' | 'mode')[];
}

export const KNOWN_DEVIATIONS: Deviation[] = [
    {
        testPattern: 'vim_jumplist_%',
        description: 'Jump recording for % differs',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_jumplist_`',
        description: 'Jump recording for backtick mark differs',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_jumplist_/',
        description: 'Jump recording for / search differs',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_jumplist_?',
        description: 'Jump recording for ? search differs',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_jumplist_skip_deleted_mark<c-o>',
        description: 'Jump list skip on deleted mark differs',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },

    {
        testPattern: /^vim_\$$/,
        description: 'Duplicate test name collision in comparison (normal $ vs visual v$)',
        reason: 'environment',
        fields: ['cursor'],
    },


    {
        testPattern: /^vim_di[\[{\}\]<>]_middle_spc$/,
        description: 'Duplicate test names cause golden comparison to match wrong entry',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_(l_repeat|w_multiple_newlines_with_space|gg|\$_repeat)$/,
        description: 'Recording artifact: Neovim state not isolated between cases',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_langmap_/,
        description: 'Langmap setup not captured in extraction (requires Vim.langmap() API)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_(map_prompt|mapclear|noremap(?!_map_interaction2))/,
        description: 'Mapping setup commands not replaying correctly in Neovim',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_ex_(map|unmap|omap|nmap|imap|api_test|special_names)/,
        description: 'Ex mapping commands not replaying correctly in Neovim',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: 'vim_dat_noop',
        description: 'dat on nested tags: CM6 findMatchingTag does not find tag when cursor is inside tag name',
        reason: 'codemirror-limitation',
        fields: ['content'],
    },
    {
        testPattern: 'vim_j_with_folding',
        description: 'Folding requires editor viewport',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_k_with_folding',
        description: 'Folding requires editor viewport',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_page_motions',
        description: 'Page motions require viewport dimensions',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: 'vim_HML',
        description: 'H/M/L require viewport dimensions',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_z[btz.\-]|^vim_z<CR>/,
        description: 'Scroll commands require viewport',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_scrollMotion',
        description: 'Scroll motions require viewport',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_mouse_select',
        description: 'Mouse events differ between CM6 and terminal',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_option_key_on_mac',
        description: 'Mac-specific Alt key handling',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: 'vim_<C-c>copy',
        description: 'Clipboard interaction differs',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: 'vim_rendered_cursor_position_cm6',
        description: 'CM6-specific cursor rendering test',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: 'vim_gcc',
        description: 'toggleComment is CM6-specific',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: 'vim_on_mode_change',
        description: 'Mode change callback is CM6-specific',
        reason: 'environment',
        fields: ['content'],
    },

    // Extraction-limited tests: these use cm.setValue(), cm.replaceRange(),
    // getRegisterController().getRegister('a').setText(), or doEx() mid-test,
    // which the step-based extractor cannot capture for Neovim replay.
    {
        testPattern: /^vim_gu_and_gU$/,
        description: 'Multi-step test uses cm.setValue() mid-test (extraction cannot capture)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_g\?$/,
        description: 'Multi-step test uses cm.setValue() mid-test (extraction cannot capture)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_mark$/,
        description: 'Test uses cm.replaceRange() mid-test (extraction cannot capture)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_mark'$/,
        description: 'Test uses gI insert mid-test causing content divergence from flat key replay',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_mark\.$/,
        description: 'O insert creates leading space difference between CM6 and Neovim autoindent',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_p_register$/,
        description: 'Test uses getRegister("a").setText() which extraction cannot capture for Neovim',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_p_wrong_register$/,
        description: 'Test uses getRegister("a").setText() which extraction cannot capture for Neovim',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_ex_normal$/,
        description: 'Multi-step test uses doEx() with complex key dispatch (extraction cannot capture)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_(>>|<<|>\{motion\}|<\{motion\}|=)$/,
        description: 'Indent config mismatch: fork tests use indentUnit=2 spaces, Neovim defaults to tabs with shiftwidth=8',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_\]p_with_spaces_translated_to_tabs$/,
        description: 'Tab conversion config mismatch: fork uses tabSize=2, Neovim defaults to tabstop=8',
        reason: 'environment',
        fields: ['content'],
    },

    {
        testPattern: /^vim_[fFtT][cdyCD],?;?$/,
        description: 'Multi-step test with setCursor/undo between steps that flat key replay cannot reproduce',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_T,$/,
        description: 'Multi-step test with setCursor between steps that flat key replay cannot reproduce',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_ex_substitute_.*_(pcre|nopcre)$/,
        description: 'JavaScript regex engine differs from Vim regex (PCRE vs Vim patterns)',
        reason: 'codemirror-limitation',
        fields: ['content'],
    },

    {
        testPattern: /^vim_ex_substitute_(javascript|highlight|nopcre_special)$/,
        description: 'Substitute regex behavior differs from Vim',
        reason: 'codemirror-limitation',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_ex_substitute_confirm_accept_then_all$/,
        description: 'Golden recorder cannot properly simulate confirm prompt ya interaction',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_\/_nongreedy$/,
        description: 'Multi-step test with setCursor between n presses (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_ex_sort_/,
        description: 'Golden recording sends \\n instead of <CR> for ex commands — sort never executes in Neovim',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_ex_global(?:_|$)/,
        description: 'Multi-step ex_global with undo/complex state (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_ex_vglobal$/,
        description: 'Multi-step ex_vglobal with undo/complex state (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_ex_go_to_mark_offset$/,
        description: 'Multi-step mark/ex interaction (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_gq_and_gw$/,
        description: 'Multi-step gq/gw test with cm.setValue mid-test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_\._/,
        description: 'Dot-repeat tests with multi-step setCursor/undo (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_macro_insert_repeat$/,
        description: 'Multi-step macro test with setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_i_(backspace|forward_delete|overwrite_backspace|repeat|indent_right|indent_left)$/,
        description: 'Insert mode tests with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_insert_ctrl_[uw]$/,
        description: 'Insert ctrl-u/w with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_o_repeat$/,
        description: 'Multi-step o-repeat test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_[AI]_visual_block(_replay)?$/,
        description: 'Visual block insert/append with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_c_visual_block(_replay)?$/,
        description: 'Visual block change with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_s_visual_block$/,
        description: 'Visual block substitute with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_Yy_blockwise$/,
        description: 'Blockwise yank with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_visual_block_(corners|mode_switch|curPos_on_exit)$/,
        description: 'Visual block state tests with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_visual_join_blank$/,
        description: 'Visual join blank with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_reselect_visual(_line)?$/,
        description: 'Reselect visual with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_(a|s_normal) .*surrogate/,
        description: 'Surrogate character tests with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_A_endOfSelectedArea$/,
        description: 'Multi-step visual A test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_o_visual$/,
        description: 'Multi-step visual-o test (extraction artifact)',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_v_paste_from_register$/,
        description: 'Multi-step visual paste test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_blockwise_paste$/,
        description: 'Multi-step blockwise paste test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_[/?] and (gn|gN|n\/N)/,
        description: 'Search/gn tests with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_\/_2_pcre$/,
        description: 'PCRE search test with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_[/?]_greedy/,
        description: 'Greedy search test with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_[*#]$/,
        description: 'Star/hash search with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_g[*#]$/,
        description: 'g-star/g-hash search with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_<C-r>_insert_mode$/,
        description: 'Insert mode Ctrl-R with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_(gj_gk|g0_g\$)$/,
        description: 'Display-line motions require viewport (like gj/gk, g0/g$)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_paragraph_motions$/,
        description: 'Multi-step paragraph motion test (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_sentence_selections$/,
        description: 'Multi-step sentence selection test (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_w_text_object_repeat$/,
        description: 'Multi-step word text object repeat (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_\[m, \]m, \[M, \]M$/,
        description: 'Multi-step method motion test (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_d_\/$/,
        description: 'Delete-to-search with multi-step setCursor (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_visual_(w|initial_selection|crossover_left|line|block_truncate_on_short_line)$/,
        description: 'Visual mode cursor off-by-one: CM6 uses exclusive selection head vs Neovim inclusive',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_[dD]_visual_block$/,
        description: 'Visual block delete cursor off-by-one (CM6 exclusive selection head)',
        reason: 'codemirror-limitation',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_r.*surrogate/,
        description: 'Surrogate character handling differs in CM6',
        reason: 'codemirror-limitation',
        fields: ['content', 'cursor'],
    },

    {
        testPattern: /^vim_e_start_to_end$/,
        description: 'e motion at document start differs (extraction context issue)',
        reason: 'environment',
        fields: ['cursor'],
    },




    {
        testPattern: /^vim_%_skip_string$/,
        description: 'Multi-step % skip string test (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_[{}]$/,
        description: 'Multi-step paragraph motion test (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_cG$/,
        description: 'Multi-step cG test with autoindent difference (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
    {
        testPattern: /^vim_p$/,
        description: 'Multi-step paste test with undo (extraction artifact)',
        reason: 'environment',
        fields: ['cursor'],
    },
    {
        testPattern: /^vim_r$/,
        description: 'Multi-step replace test with visual mode (extraction artifact)',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_r_visual_block$/,
        description: 'Multi-step visual block replace (extraction artifact)',
        reason: 'environment',
        fields: ['content'],
    },
    {
        testPattern: /^vim_visual$/,
        description: 'Multi-step visual mode test with operators (extraction artifact)',
        reason: 'environment',
        fields: ['content', 'cursor'],
    },
];

export function isKnownDeviation(testName: string): Deviation | null {
    return KNOWN_DEVIATIONS.find((d) =>
        typeof d.testPattern === 'string'
            ? testName.includes(d.testPattern)
            : d.testPattern.test(testName),
    ) ?? null;
}
