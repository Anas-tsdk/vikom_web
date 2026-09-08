using backend.Services;
using Xunit;

namespace backend.Tests;

/// <summary>
/// The search term is interpolated into a PostgREST filter
/// (<c>username=ilike.*term*</c>), where a comma starts a new filter and
/// parentheses open a logic tree. These cover the boundary that stops a
/// caller-supplied string from reshaping that query, plus the page-size clamp.
/// Pure string work — no HTTP involved.
/// </summary>
public class SupabaseProfileQueryTests
{
    [Theory]
    [InlineData("wayki")]
    [InlineData("ingrid.berg")]
    [InlineData("bong_wayki")]
    [InlineData("erik-2")]
    [InlineData("wayki@oslomet.no")]
    [InlineData("Åse")]
    public void Ordinary_usernames_are_accepted(string query)
    {
        Assert.Equal(query, SupabaseProfileDirectory.NormalizeQuery(query));
    }

    [Fact]
    public void Surrounding_whitespace_is_trimmed()
    {
        Assert.Equal("wayki", SupabaseProfileDirectory.NormalizeQuery("  wayki  "));
    }

    [Theory]
    [InlineData("a,b")]              // would start a second PostgREST filter
    [InlineData("a(b)")]             // would open a logic tree
    [InlineData("wayki*")]           // ilike wildcard
    [InlineData("100%")]             // SQL LIKE wildcard
    [InlineData("say \"hi\"")]
    [InlineData("back\\slash")]
    [InlineData("two words")]
    [InlineData("a&b=c")]
    public void Filter_metacharacters_are_refused(string query)
    {
        Assert.Null(SupabaseProfileDirectory.NormalizeQuery(query));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("a")]                // below the two-character minimum
    public void Empty_or_too_short_queries_are_refused(string? query)
    {
        Assert.Null(SupabaseProfileDirectory.NormalizeQuery(query));
    }

    [Fact]
    public void Overlong_queries_are_refused()
    {
        Assert.Null(SupabaseProfileDirectory.NormalizeQuery(new string('a', 65)));
        Assert.NotNull(SupabaseProfileDirectory.NormalizeQuery(new string('a', 64)));
    }

    [Theory]
    [InlineData(null, 8)]
    [InlineData(0, 8)]
    [InlineData(-5, 8)]
    [InlineData(3, 3)]
    [InlineData(25, 25)]
    [InlineData(500, 25)]
    public void Limit_is_clamped_into_range(int? requested, int expected)
    {
        Assert.Equal(expected, SupabaseProfileDirectory.NormalizeLimit(requested));
    }
}
