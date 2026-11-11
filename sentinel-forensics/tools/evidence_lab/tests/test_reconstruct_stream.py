"""Invented source-record stream regressions; no actual capture or decoder."""
from dataclasses import replace
import hashlib
import io
import struct
import unittest

import core
import capture
import reconstruct_stream as module
from reconstruct_profile import SOLO


def header(endian='<', units=10**6, link=1):
    magic = {('<', 10**6): b'\xd4\xc3\xb2\xa1', ('>', 10**6): b'\xa1\xb2\xc3\xd4',
             ('<', 10**9): b'\x4d\x3c\xb2\xa1', ('>', 10**9): b'\xa1\xb2\x3c\x4d'}
    return magic[endian, units] + struct.pack(endian+'HHiiII', 2, 4, 0, 0, core.MAX_RECORD, link)


def record(payload=b'invented', endian='<', units=10**6):
    return struct.pack(endian+'IIII', 7, units-1, len(payload), len(payload)) + payload


def fixture(records=None, *, endian='<', units=10**6):
    records = records or [record(endian=endian, units=units)]
    head, refs, offset = header(endian, units), [], 24
    for i, raw in enumerate(records, 1):
        refs.append(module.PacketReference(i, i, offset, len(raw),
                    hashlib.sha256(raw).hexdigest(), 1))
        offset += len(raw)
    return head, records, refs, head+b''.join(records)


class CohortStreamTests(unittest.TestCase):
    def adapter(self, data, head, refs, **kwargs):
        source = kwargs.pop('source', None)
        return module.ClassicCohortStream(source if source is not None else io.BytesIO(data),
            source_id=3, source_size=len(data), header=head, references=refs,
            validator=module.classic_validator(core.Reader, capture.classic), **kwargs)

    def assert_error(self, code, action):
        with self.assertRaisesRegex(module.CohortStreamError, '^'+code+'$'):
            action()

    def test_exact_gapped_selection_duplicates_and_original_mapping(self):
        raw = record(b'invented repeated packet')
        head, raws, refs, data = fixture([raw, record(b'skipped occurrence'), raw])
        stream = self.adapter(data, head, (refs[0], refs[2]))
        self.assertEqual(stream.read(0), b'')
        self.assertIsNone(stream.derivative_sha256)
        output = bytearray()
        for size in (1, 7, 24, 17, module.MAX_READ):
            output.extend(stream.read(size))
        self.assertEqual(bytes(output), head+raw+raw)
        self.assertTrue(stream.complete)
        self.assertEqual(stream.read(10), b'')
        self.assertEqual(stream.derivative_sha256, hashlib.sha256(output).hexdigest())
        self.assertNotEqual(stream.derivative_sha256, hashlib.sha256(data).hexdigest())
        mapped = stream.frame_reference(2)
        self.assertEqual((mapped['source_id'], mapped['mini_frame'], mapped['ordinal'],
                          mapped['packet_number'], mapped['offset'], mapped['length'], mapped['sha256']),
                         (3, 2, 3, 3, refs[2].offset, refs[2].length, refs[2].sha256))
        self.assertNotEqual(mapped['offset'], 24+len(raw))
        self.assertEqual(stream.references[0].sha256, stream.references[1].sha256)

    def test_original_byte_orders_and_timestamp_resolutions(self):
        for endian in ('<', '>'):
            for units in (10**6, 10**9):
                with self.subTest(endian=endian, units=units):
                    head, raws, refs, data = fixture(endian=endian, units=units)
                    stream = self.adapter(data, head, refs)
                    self.assertEqual(stream.read(module.MAX_READ), data)
                    self.assertTrue(stream.complete)

    def test_partial_stream_has_no_complete_hash_and_reads_are_bounded(self):
        head, _, refs, data = fixture()
        stream = self.adapter(data, head, refs)
        self.assertEqual(stream.read(3), head[:3])
        self.assertFalse(stream.complete)
        self.assertIsNone(stream.derivative_sha256)
        for bad in (-1, module.MAX_READ+1, True, None):
            self.assert_error('read_size_budget', lambda bad=bad: stream.read(bad))
        for bad in (0, 2, True):
            self.assert_error('unknown_mini_frame', lambda bad=bad: stream.frame_reference(bad))

    def test_hash_failure_happens_before_record_bytes_are_emitted(self):
        head, _, refs, data = fixture()
        stream = self.adapter(data, head, [replace(refs[0], sha256='0'*64)])
        self.assertEqual(stream.read(24), head)
        self.assert_error('source_record_hash_mismatch', lambda: stream.read(1))
        self.assertEqual(stream.emitted_bytes, 24)
        self.assertIsNone(stream.derivative_sha256)
        self.assert_error('source_record_hash_mismatch', lambda: stream.read(1))

    def test_existing_framer_rejects_malformed_record_even_with_matching_hash(self):
        raw = struct.pack('<IIII', 0, 0, 4, 1)+b'abcd'
        head, _, refs, data = fixture([raw])
        stream = self.adapter(data, head, refs)
        self.assert_error('classic_framing_invalid', lambda: stream.read(module.MAX_READ))
        self.assertEqual(stream.emitted_bytes, 0)
        self.assertIsNone(stream.derivative_sha256)

    def test_source_header_and_initial_size_must_match(self):
        head, _, refs, data = fixture()
        self.assert_error('source_header_mismatch', lambda:
                          self.adapter(data, header(link=101), refs))
        self.assert_error('source_size_mismatch', lambda:
                          self.adapter(data, head, refs, source=io.BytesIO(data+b'extra')))
        self.assert_error('classic_framing_invalid', lambda:
                          self.adapter(data, head[:4]+b'\x00\x00'+head[6:], refs))
        self.assert_error('unsupported_capture_format', lambda:
                          self.adapter(data, capture.NG+head[4:], refs))
        self.assert_error('invalid_header_size', lambda:self.adapter(data, head[:23], refs))

    def test_unsorted_overlapping_duplicate_and_invalid_references_reject(self):
        head, _, refs, data = fixture([record(b'a'),record(b'b')])
        for plan in ([refs[1],refs[0]], [refs[0],refs[0]],
                     [refs[0],replace(refs[1],offset=refs[0].offset+1)],
                     [refs[0],replace(refs[1],ordinal=refs[0].ordinal)],
                     [refs[0],replace(refs[1],packet_number=refs[0].packet_number)]):
            self.assert_error('reference_order_overlap_or_duplicate', lambda plan=plan:
                              self.adapter(data, head, plan))
        cases = [('invalid_reference_number', replace(refs[0],ordinal=True)),
                 ('invalid_reference_offset', replace(refs[0],offset=23)),
                 ('invalid_reference_length_or_range', replace(refs[0],length=len(data))),
                 ('invalid_reference_hash', replace(refs[0],sha256='not a hash'))]
        for code, ref in cases:
            self.assert_error(code, lambda ref=ref:self.adapter(data, head, [ref]))
        self.assert_error('empty_cohort_plan', lambda:self.adapter(data, head, []))

    def test_truncation_after_construction_is_explicit(self):
        head, _, refs, data = fixture()
        source = io.BytesIO(data)
        stream = self.adapter(data, head, refs, source=source)
        source.truncate(len(data)-1)
        self.assert_error('source_truncated_or_invalid_read', lambda:stream.read(module.MAX_READ))
        self.assertIsNone(stream.derivative_sha256)

    def test_guard_failure_is_sanitized_and_terminal(self):
        head, _, refs, data = fixture()
        stop = [False]
        def guard():
            if stop[0]: raise ValueError('untrusted details must not escape')
        stream = self.adapter(data, head, refs, guard=guard)
        stop[0] = True
        self.assert_error('source_io_or_guard_failed', lambda:stream.read(1))
        self.assertIsNone(stream.derivative_sha256)
        stop[0] = False
        self.assert_error('source_io_or_guard_failed', lambda:stream.read(1))

    def test_plan_caps_fail_before_any_source_reads(self):
        class Unreadable:
            def read(self, size): raise AssertionError('source must not open')
            def seek(self, *args): raise AssertionError('source must not open')
        def make(refs, size):
            return module.ClassicCohortStream(Unreadable(), source_id=1, source_size=size,
                header=header(), references=refs,
                validator=module.classic_validator(core.Reader,capture.classic))
        many = [module.PacketReference(i+1,i+1,24+16*i,16,'0'*64,1)
                for i in range(module.MAX_FRAMES+1)]
        self.assert_error('frame_budget_exceeded',lambda:make(many,24+16*len(many)))
        large = [module.PacketReference(i+1,i+1,24+module.MAX_RECORD_BYTES*i,
                 module.MAX_RECORD_BYTES,'0'*64,1) for i in range(16)]
        self.assert_error('batch_byte_budget_exceeded',lambda:
                          make(large,24+module.MAX_RECORD_BYTES*16))
        five = [module.PacketReference(i+1,i+1,24+16*i,16,'0'*64,i+1) for i in range(5)]
        self.assert_error('cohort_budget_exceeded',lambda:make(five,24+16*len(five)))

    def test_short_source_reads_and_maximum_record_are_supported(self):
        class ShortSource(io.BytesIO):
            def read(self, size):
                self.requested = max(getattr(self,'requested',0),size)
                return super().read(min(size, 7))
        head, _, refs, data = fixture()
        source = ShortSource(data)
        stream = self.adapter(data, head, refs, source=source)
        self.assertEqual(stream.read(module.MAX_READ),data)
        self.assertLessEqual(source.requested,module.MAX_READ)
        head, _, refs, data = fixture([record(b'x'*core.MAX_RECORD)])
        stream = self.adapter(data, head, refs)
        output = stream.read(module.MAX_READ)+stream.read(module.MAX_READ)
        self.assertEqual(output,data)
        self.assertTrue(stream.complete)

    def test_solo_full_frame_boundary_preserves_all_duplicate_occurrences(self):
        # Every occurrence has identical bytes, but a distinct original locator.
        raw=record(b'')
        head,_,refs,data=fixture([raw]*32768)
        stream=self.adapter(data,head,refs,profile=SOLO)
        digest=hashlib.sha256();emitted=0
        while chunk:=stream.read(module.MAX_READ):
            digest.update(chunk);emitted+=len(chunk)
        self.assertTrue(stream.complete)
        self.assertEqual(emitted,len(data))
        self.assertEqual(stream.derivative_sha256,digest.hexdigest())
        self.assertEqual(stream.frame_reference(32768)['ordinal'],32768)
        self.assertEqual(stream.frame_reference(32768)['offset'],24+32767*len(raw))
        self.assert_error('frame_budget_exceeded',lambda:self.adapter(data,head,refs))
        head,_,refs,data=fixture([raw]*32769)
        self.assert_error('frame_budget_exceeded',lambda:self.adapter(data,head,refs,profile=SOLO))

    def test_solo_full_byte_boundary_includes_header_and_keeps_record_size_cap(self):
        # 31 maximal records plus one shorter record fill exactly32MiB.
        maximum=record(b'x'*core.MAX_RECORD)
        final_length=33554432-24-31*len(maximum)
        head,_,refs,data=fixture([maximum]*31+[record(b'y'*(final_length-16))])
        self.assertEqual(len(data),33554432)
        stream=self.adapter(data,head,refs,profile=SOLO)
        digest=hashlib.sha256()
        while chunk:=stream.read(module.MAX_READ):digest.update(chunk)
        self.assertTrue(stream.complete)
        self.assertEqual(stream.derivative_sha256,digest.hexdigest())
        self.assert_error('batch_byte_budget_exceeded',lambda:self.adapter(data,head,refs))
        head,_,refs,data=fixture([maximum]*31+[record(b'y'*(final_length-15))])
        self.assert_error('batch_byte_budget_exceeded',lambda:self.adapter(data,head,refs,profile=SOLO))
        head,_,refs,data=fixture([record(b'x'*(core.MAX_RECORD+1))])
        self.assert_error('invalid_reference_length_or_range',lambda:self.adapter(data,head,refs,profile=SOLO))

    def test_solo_rejects_multiple_cohorts_and_unknown_profile_before_source_reads(self):
        head,_,refs,data=fixture([record(),record()])
        refs[1]=replace(refs[1],cohort=2)
        self.assert_error('cohort_budget_exceeded',lambda:self.adapter(data,head,refs,profile=SOLO))
        for value in (None,True,{},'unbounded'):
            with self.subTest(value=value),self.assertRaisesRegex(core.IngestError,'tls_unknown_analysis_profile'):
                self.adapter(data,head,refs,profile=value)


if __name__ == '__main__':
    unittest.main(verbosity=2)
